import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgeItems, projects, reports, tasks } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { executeTask } from "@/server/ai/orchestrator/executor";
import { createTask } from "@/server/services/workspace";
import { writeAudit } from "@/server/audit/logger";
import { buildReport, buildSummary, runChecks } from "./helpers";
import type {
  StepState,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowStep,
} from "./types";

/**
 * 单个节点的执行器。
 *
 * 每个分支都必须满足一条：**产出是真实的，或者明确说明为什么没有产出**。
 * 没有「假装执行成功」的分支——deferred 节点标 skipped 并写明原因，
 * 人工节点标 waiting 并告诉人要填什么。
 */

export interface RunStepInput {
  userId: string;
  runId: string;
  workflowSlug: string;
  workflowName: string;
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  step: WorkflowStep;
}

export interface RunStepOutput {
  state: StepState;
  /** 需要人做什么；有值即代表这一步停下等人 */
  humanAction?: string;
}

const stamp = () => ({ startedAt: new Date().toISOString() });

export async function runStep(input: RunStepInput): Promise<RunStepOutput> {
  const { userId, runId, workflowSlug, workflowName, def, ctx, step } = input;
  const started = stamp();

  switch (step.kind) {
    case "start":
      return runStartStep({ userId, workflowName, ctx, step, started });
    case "manual":
      return runManualStep({ def, ctx, step, started });
    case "agent":
      return runAgentStep({ userId, runId, workflowSlug, ctx, step, started });
    case "summary":
      return {
        state: {
          ...started,
          status: "succeeded",
          output: buildSummary(def, ctx, workflowName),
          finishedAt: new Date().toISOString(),
        },
      };
    case "check":
      return runCheckStep({ def, ctx, step, started });
    case "report":
      return runReportStep({ userId, workflowName, def, ctx, started });
    case "gate":
      return {
        state: { ...started, status: "waiting" },
        humanAction: `${step.description} 通过后，本次流程创建的所有节点任务会一并标记完成。`,
      };
    case "archive":
      return runArchiveStep({ userId, workflowName, workflowSlug, def, ctx, started });
    case "deferred":
      return {
        state: {
          ...started,
          status: "skipped",
          reason: step.reason ?? "本阶段不执行",
          finishedAt: new Date().toISOString(),
        },
      };
    default: {
      const exhaustive: never = step.kind;
      throw new AppError("STEP_KIND_UNKNOWN", `未知节点类型：${String(exhaustive)}`, 500);
    }
  }
}

/** 节点 1：准备项目载体。没有项目就真建一个，不挂空 ID */
async function runStartStep(input: {
  userId: string;
  workflowName: string;
  ctx: WorkflowContext;
  step: WorkflowStep;
  started: { startedAt: string };
}): Promise<RunStepOutput> {
  const db = getDb();
  const { userId, workflowName, ctx, started } = input;

  if (ctx.projectId) {
    const [exists] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, ctx.projectId), eq(projects.userId, userId)))
      .limit(1);
    if (!exists) {
      throw new AppError("PROJECT_NOT_FOUND", "指定的项目不存在或不属于当前用户", 404);
    }
    return {
      state: {
        ...started,
        status: "succeeded",
        output: `已复用项目：${ctx.projectId}`,
        recordId: ctx.projectId,
        finishedAt: new Date().toISOString(),
      },
    };
  }

  const dateLabel = new Date().toLocaleDateString("zh-CN");
  const rawName = ctx.goal.trim() || `${workflowName} · ${dateLabel}`;
  const name = rawName.length >= 2 ? rawName.slice(0, 120) : workflowName;

  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name,
      description: `由工作流「${workflowName}」创建，用于承载本次全部节点产出。`,
      status: "active",
      dataType: "U",
    })
    .returning({ id: projects.id });

  ctx.projectId = project.id;

  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "project",
    entityId: project.id,
    permissionLevel: "L2",
    detail: { name, source: "workflow", workflow: workflowName },
  });

  return {
    state: {
      ...started,
      status: "succeeded",
      output: `已创建项目「${name}」（${project.id}）`,
      recordId: project.id,
      finishedAt: new Date().toISOString(),
    },
  };
}

/** 节点 2 等人工节点：有输入就直接过，没输入就停下等人填 */
function runManualStep(input: {
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  step: WorkflowStep;
  started: { startedAt: string };
}): RunStepOutput {
  const { def, ctx, step, started } = input;
  const manualCount = def.steps.filter((s) => s.kind === "manual").length;
  const provided =
    ctx.inputs?.[step.id] ?? (manualCount === 1 ? ctx.goal : ctx.steps[step.id]?.note ?? "");
  const text = (provided ?? "").trim();

  if (text.length >= 6) {
    return {
      state: {
        ...started,
        status: "succeeded",
        output: text,
        finishedAt: new Date().toISOString(),
      },
    };
  }

  return {
    state: { ...started, status: "waiting" },
    humanAction: `请填写「${step.title}」${step.inputHint ? `，${step.inputHint}` : ""}`,
  };
}

/** 节点 4–7：真的建任务、真的走执行引擎、真的写 agent_runs */
async function runAgentStep(input: {
  userId: string;
  runId: string;
  workflowSlug: string;
  ctx: WorkflowContext;
  step: WorkflowStep;
  started: { startedAt: string };
}): Promise<RunStepOutput> {
  const { userId, runId, workflowSlug, ctx, step, started } = input;
  if (!step.agentSlug) {
    throw new AppError("STEP_AGENT_MISSING", `节点「${step.title}」未指定 Agent`, 500);
  }
  const db = getDb();
  const title = `${step.taskTitle ?? step.title}`.slice(0, 200);

  const task = await createTask(userId, {
    title,
    projectId: ctx.projectId ?? null,
    priority: 2,
    source: "workflow",
    dataType: "U",
  });

  await db
    .update(tasks)
    .set({
      detail: [
        step.description,
        step.acceptance ? `验收标准：${step.acceptance}` : "",
        `来源：工作流运行 ${runId}`,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000),
    })
    .where(eq(tasks.id, task.id));

  const result = await executeTask({
    userId,
    taskId: task.id,
    agentSlug: step.agentSlug,
    trigger: `workflow.${workflowSlug}.${step.id}`,
  });

  return {
    state: {
      ...started,
      status: "succeeded",
      output: result.output,
      taskId: task.id,
      runId: result.runId,
      mode: result.mode,
      issues: result.quality.pass ? undefined : result.quality.issues,
      finishedAt: new Date().toISOString(),
      durationMs: result.durationMs,
    },
  };
}

/** 节点 10/11：核对。阻断项会停下等人确认，提示项随报告一起展示 */
function runCheckStep(input: {
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  step: WorkflowStep;
  started: { startedAt: string };
}): RunStepOutput {
  const { def, ctx, step, started } = input;
  const checks = step.checks ?? (["coverage", "evidence", "traceability", "no-fake-conclusion"] as const);
  const result = runChecks(def, ctx, [...checks]);
  const issues = [...result.blocking, ...result.advisory];

  const output = [
    `核对节点：${step.title}`,
    "",
    result.blocking.length === 0
      ? "阻断项：无"
      : `阻断项（${result.blocking.length}）：\n${result.blocking.map((i) => `- ${i}`).join("\n")}`,
    "",
    result.advisory.length === 0
      ? "提示项：无"
      : `提示项（${result.advisory.length}）：\n${result.advisory.map((i) => `- ${i}`).join("\n")}`,
  ].join("\n");

  if (result.blocking.length > 0) {
    return {
      state: { ...started, status: "waiting", issues, output },
      humanAction: `核对发现 ${result.blocking.length} 个阻断项。请补齐证据，或明确接受风险后继续。`,
    };
  }

  return {
    state: { ...started, status: "succeeded", issues, output, finishedAt: new Date().toISOString() },
  };
}

/** 节点 12：报告落 reports 表，供后续导出复用 */
async function runReportStep(input: {
  userId: string;
  workflowName: string;
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  started: { startedAt: string };
}): Promise<RunStepOutput> {
  const { userId, workflowName, def, ctx, started } = input;
  const db = getDb();
  const generatedAt = new Date();

  const { title, summary, body } = buildReport({
    workflowName,
    goal: ctx.goal,
    def,
    ctx,
    projectId: ctx.projectId,
    generatedAt,
  });

  const [report] = await db
    .insert(reports)
    .values({
      userId,
      title: title.slice(0, 200),
      kind: "research",
      summary,
      body,
      projectId: ctx.projectId ?? null,
      status: "draft",
      dataType: "U",
    })
    .returning({ id: reports.id });

  ctx.reportId = report.id;
  ctx.reportBody = body;

  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "report",
    entityId: report.id,
    permissionLevel: "L2",
    detail: { workflow: workflowName, kind: "research" },
  });

  return {
    state: {
      ...started,
      status: "succeeded",
      output: `${body}\n\n（报告已写入 reports 表：${report.id}，状态 draft，待人工审核）`,
      recordId: report.id,
      finishedAt: new Date().toISOString(),
    },
  };
}

/** 节点 14：归档到知识库，正文取报告；没有报告时退回汇总 */
async function runArchiveStep(input: {
  userId: string;
  workflowName: string;
  workflowSlug: string;
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  started: { startedAt: string };
}): Promise<RunStepOutput> {
  const { userId, workflowName, workflowSlug, def, ctx, started } = input;
  const db = getDb();

  // 有报告就归档报告；没有报告节点（如选品验证）就归档前序产出汇总，并标明来源
  const body = ctx.reportBody?.trim()
    ? ctx.reportBody
    : [
        buildSummary(def, ctx, workflowName),
        "",
        "———",
        "说明：本条流程没有报告节点，上面是按节点顺序拼接的产出汇总，不含新的分析或结论。",
      ].join("\n");

  if (!body.trim()) {
    throw new AppError("ARCHIVE_EMPTY", "没有任何可归档的产出，已停止归档。", 409);
  }

  const dateLabel = new Date().toLocaleDateString("zh-CN");
  const [item] = await db
    .insert(knowledgeItems)
    .values({
      userId,
      title: `${workflowName} · ${dateLabel}`.slice(0, 200),
      body,
      category: "工作流产出",
      tags: workflowSlug,
      sourceType: "workflow",
      dataType: "U",
    })
    .returning({ id: knowledgeItems.id });

  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "knowledge_item",
    entityId: item.id,
    permissionLevel: "L2",
    detail: { workflow: workflowName, source: "workflow" },
  });

  return {
    state: {
      ...started,
      status: "succeeded",
      output: `已保存到知识库：${item.id}`,
      recordId: item.id,
      finishedAt: new Date().toISOString(),
    },
  };
}

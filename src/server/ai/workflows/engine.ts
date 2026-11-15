import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { tasks, workflowRuns, workflows } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { writeAudit } from "@/server/audit/logger";
import { parseDefinition } from "./definitions";
import { runStep } from "./step-runner";
import {
  NO_MODEL_DISCLAIMER,
  type AdvanceResult,
  type StepState,
  type WorkflowContext,
  type WorkflowDefinition,
} from "./types";

/**
 * 工作流调度器。
 *
 * 状态机只有五个态（与库里的 run_status 枚举一致）：
 *   queued（可推进 / 等人处理） → running（这一瞬间有人在跑） → succeeded / failed / cancelled
 *
 * 「等人」用 queued 表达而不是新增 blocked，是因为枚举已定：
 * 真正的判断依据是「有没有 status=waiting 的节点」+ currentNode，UI 据此显示要做的事。
 *
 * 三条硬约束：
 * 1. 一次请求最多推进 12 步，防止定义写错导致死循环。
 * 2. 每步执行完立刻落库，进程崩了也能从断点继续。
 * 3. 人工闸门不通过，流程绝不前进——decision 只能由 API 显式传入。
 */

type WorkflowRow = typeof workflows.$inferSelect;

function toContext(raw: unknown): WorkflowContext {
  const ctx = (raw ?? {}) as Partial<WorkflowContext>;
  return {
    goal: typeof ctx.goal === "string" ? ctx.goal : "",
    inputs: ctx.inputs ?? {},
    projectId: ctx.projectId,
    steps: ctx.steps ?? {},
    log: Array.isArray(ctx.log) ? ctx.log : [],
    reportBody: ctx.reportBody,
    reportId: ctx.reportId,
  };
}

function firstPending(def: WorkflowDefinition, ctx: WorkflowContext) {
  return def.steps.find((s) => (ctx.steps[s.id]?.status ?? "pending") === "pending");
}

function pushLog(ctx: WorkflowContext, stepId: string, level: "info" | "warn" | "error", message: string) {
  ctx.log.push({ at: new Date().toISOString(), stepId, level, message });
  if (ctx.log.length > 300) ctx.log.splice(0, ctx.log.length - 300);
}

async function loadWorkflow(workflowId: string): Promise<WorkflowRow> {
  const rows = await getDb().select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!rows.length) throw new AppError("WORKFLOW_NOT_FOUND", "工作流不存在", 404);
  return rows[0];
}

function safeParse(raw: unknown, workflowName: string): WorkflowDefinition {
  try {
    return parseDefinition(raw);
  } catch (error) {
    throw new AppError(
      "WORKFLOW_DEFINITION_INVALID",
      `工作流「${workflowName}」的定义不合法：${error instanceof Error ? error.message : "未知原因"}`,
      422,
    );
  }
}

/** 启动一次运行，并立即推进到第一个停点 */
export async function startWorkflowRun(
  userId: string,
  slug: string,
  options: { goal?: string; projectId?: string; inputs?: Record<string, string> } = {},
): Promise<AdvanceResult> {
  const db = getDb();
  const [wf] = await db.select().from(workflows).where(eq(workflows.slug, slug)).limit(1);
  if (!wf) {
    throw new AppError("WORKFLOW_NOT_FOUND", `未找到工作流「${slug}」，请先执行 npm run db:seed`, 404);
  }
  if (wf.enabled !== "true") {
    throw new AppError("WORKFLOW_DISABLED", `工作流「${wf.name}」已停用`, 409);
  }

  const def = safeParse(wf.definition, wf.name);
  const ctx: WorkflowContext = {
    goal: (options.goal ?? "").trim(),
    inputs: options.inputs ?? {},
    projectId: options.projectId,
    steps: {},
    log: [],
  };
  for (const step of def.steps) ctx.steps[step.id] = { status: "pending" };

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId: wf.id,
      userId,
      projectId: options.projectId ?? null,
      status: "queued",
      currentNode: def.steps[0]?.id ?? null,
      context: ctx as unknown as Record<string, unknown>,
    })
    .returning();

  await writeAudit(db, {
    userId,
    action: "run",
    entityType: "workflow",
    entityId: wf.id,
    permissionLevel: "L2",
    detail: { action: "start", runId: run.id, slug: wf.slug, goal: ctx.goal.slice(0, 200) },
  });

  return advanceWorkflowRun(userId, run.id);
}

/** 推进到下一个停点（闸门 / 人工节点 / 失败 / 结束） */
export async function advanceWorkflowRun(userId: string, runId: string): Promise<AdvanceResult> {
  const db = getDb();

  // 原子抢占：并发的两个请求只有一个能把 queued 改成 running
  const claimed = await db
    .update(workflowRuns)
    .set({ status: "running" })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.userId, userId),
        eq(workflowRuns.status, "queued"),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.userId, userId)))
      .limit(1);
    if (!existing) throw new AppError("RUN_NOT_FOUND", "运行记录不存在或不属于当前用户", 404);
    if (existing.status === "running") {
      throw new AppError("RUN_BUSY", "本次运行正在执行中，请等当前步骤结束后再继续", 409);
    }
    throw new AppError(
      "RUN_FINISHED",
      `本次运行已结束（${existing.status}），不能继续推进。请重新启动一次运行。`,
      409,
    );
  }

  const run = claimed[0];
  const wf = await loadWorkflow(run.workflowId);
  const def = safeParse(wf.definition, wf.name);
  const ctx = toContext(run.context);
  for (const step of def.steps) if (!ctx.steps[step.id]) ctx.steps[step.id] = { status: "pending" };

  // 已有节点在等人处理时不允许「推进」绕过它——闸门必须走 decide
  const waitingId = Object.entries(ctx.steps).find(([, s]) => s.status === "waiting")?.[0];
  if (waitingId) {
    await db
      .update(workflowRuns)
      .set({ status: "queued", currentNode: waitingId })
      .where(eq(workflowRuns.id, run.id));
    return buildResult({
      runId: run.id,
      wf,
      def,
      ctx,
      status: "queued",
      executed: [],
      needsHuman: true,
      humanAction: "当前节点等待你处理：请先在上方提交决定，流程不会自动跳过人工闸门。",
    });
  }

  const executed: AdvanceResult["executed"] = [];
  let needsHuman = false;
  let humanAction: string | null = null;
  let status: AdvanceResult["status"] = "queued";

  const persist = async (currentNode: string | null, finalStatus: AdvanceResult["status"]) => {
    await db
      .update(workflowRuns)
      .set({
        status: finalStatus,
        currentNode,
        projectId: ctx.projectId ?? run.projectId,
        context: ctx as unknown as Record<string, unknown>,
        ...(finalStatus === "succeeded" || finalStatus === "failed" || finalStatus === "cancelled"
          ? { finishedAt: new Date() }
          : {}),
      })
      .where(eq(workflowRuns.id, run.id));
  };

  try {
    // 上限按定义长度自适应：定义多长都能一次跑到停点，同时防住定义写错导致的死循环
    const stepLimit = Math.max(12, def.steps.length + 2);
    for (let guard = 0; guard < stepLimit; guard += 1) {
      const step = firstPending(def, ctx);
      if (!step) {
        status = "succeeded";
        break;
      }

      ctx.steps[step.id] = { status: "running", startedAt: new Date().toISOString() };
      await persist(step.id, "running");

      const result = await runStep({
        userId,
        runId: run.id,
        workflowSlug: wf.slug,
        workflowName: wf.name,
        def,
        ctx,
        step,
      });

      ctx.steps[step.id] = result.state;
      executed.push({ stepId: step.id, title: step.title, status: result.state.status });
      pushLog(
        ctx,
        step.id,
        result.state.status === "waiting" ? "warn" : result.state.status === "failed" ? "error" : "info",
        `${step.title}：${result.state.status}`,
      );

      if (result.state.status === "waiting") {
        needsHuman = true;
        humanAction = result.humanAction ?? "请处理该节点后继续";
        status = "queued";
        break;
      }
      if (result.state.status === "failed") {
        status = "failed";
        break;
      }

      await persist(firstPending(def, ctx)?.id ?? null, "running");
    }

    // 全部节点都是 succeeded / skipped，才算真正跑完
    if (status !== "failed" && !needsHuman && !firstPending(def, ctx)) status = "succeeded";

    const currentNode = needsHuman
      ? (Object.entries(ctx.steps).find(([, s]) => s.status === "waiting")?.[0] ?? null)
      : (firstPending(def, ctx)?.id ?? null);

    await persist(currentNode, status);

    return buildResult({
      runId: run.id,
      wf,
      def,
      ctx,
      status,
      executed,
      needsHuman,
      humanAction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "执行失败";
    const currentStep = def.steps.find((s) => ctx.steps[s.id]?.status === "running");
    if (currentStep) {
      ctx.steps[currentStep.id] = {
        ...(ctx.steps[currentStep.id] as StepState),
        status: "failed",
        note: message,
        finishedAt: new Date().toISOString(),
      };
      executed.push({ stepId: currentStep.id, title: currentStep.title, status: "failed" });
    }
    pushLog(ctx, currentStep?.id ?? "run", "error", message);
    await persist(currentStep?.id ?? run.currentNode ?? null, "failed");
    await writeAudit(db, {
      userId,
      action: "error",
      entityType: "workflow_run",
      entityId: run.id,
      permissionLevel: "L2",
      detail: { workflow: wf.slug, error: message, step: currentStep?.id ?? null },
    });

    if (error instanceof AppError && error.status < 500) {
      // 业务错误：把状态写清后照常返回给调用方，避免前端只看到 500
      return buildResult({
        runId: run.id,
        wf,
        def,
        ctx,
        status: "failed",
        executed,
        needsHuman: false,
        humanAction: null,
      });
    }
    throw error;
  }
}

/** 人工决策：批准（继续）/ 驳回（终止） */
export async function decideWorkflowRun(
  userId: string,
  runId: string,
  decision: "approve" | "reject",
  note = "",
): Promise<AdvanceResult> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.userId, userId)))
    .limit(1);
  if (!run) throw new AppError("RUN_NOT_FOUND", "运行记录不存在或不属于当前用户", 404);
  if (run.status === "running") {
    throw new AppError("RUN_BUSY", "本次运行正在执行中，请稍后再决策", 409);
  }
  if (run.status !== "queued") {
    throw new AppError("RUN_FINISHED", "本次运行已结束，不能再次决策", 409);
  }

  const wf = await loadWorkflow(run.workflowId);
  const def = safeParse(wf.definition, wf.name);
  const ctx = toContext(run.context);

  const waitingId = Object.entries(ctx.steps).find(([, s]) => s.status === "waiting")?.[0];
  if (!waitingId) {
    throw new AppError("NOTHING_TO_DECIDE", "当前没有等待人工处理的节点", 409);
  }
  const step = def.steps.find((s) => s.id === waitingId);
  if (!step) throw new AppError("STEP_NOT_FOUND", "等待中的节点不在当前定义里", 409);

  if (decision === "reject") {
    ctx.steps[waitingId] = {
      ...ctx.steps[waitingId],
      status: "failed",
      decision: "reject",
      note,
      finishedAt: new Date().toISOString(),
    };
    pushLog(ctx, waitingId, "warn", `人工驳回：${note || "未填写原因"}`);
    await db
      .update(workflowRuns)
      .set({
        status: "cancelled",
        currentNode: waitingId,
        context: ctx as unknown as Record<string, unknown>,
        finishedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));

    await writeAudit(db, {
      userId,
      action: "reject",
      entityType: "workflow_run",
      entityId: run.id,
      permissionLevel: "L3",
      detail: { workflow: wf.slug, step: waitingId, note },
    });

    return buildResult({
      runId: run.id,
      wf,
      def,
      ctx,
      status: "cancelled",
      executed: [],
      needsHuman: false,
      humanAction: null,
    });
  }

  // 批准：人工节点把备注当作产出；闸门节点额外把本流程所有任务标记完成
  const isManual = step.kind === "manual";
  ctx.steps[waitingId] = {
    ...ctx.steps[waitingId],
    status: "succeeded",
    decision: "approve",
    note,
    ...(isManual ? { output: (note || ctx.steps[waitingId].output || "").trim() } : {}),
    finishedAt: new Date().toISOString(),
  };
  if (isManual && note.trim().length >= 6) {
    ctx.inputs = { ...(ctx.inputs ?? {}), [waitingId]: note.trim() };
  }
  pushLog(ctx, waitingId, "info", `人工确认通过${note ? `：${note}` : ""}`);

  if (step.kind === "gate") {
    const taskIds = Object.values(ctx.steps)
      .map((s) => s.taskId)
      .filter((id): id is string => Boolean(id));
    if (taskIds.length > 0) {
      await db
        .update(tasks)
        .set({ status: "done", updatedAt: new Date() })
        .where(inArray(tasks.id, taskIds));
    }
    pushLog(ctx, waitingId, "info", `本次流程的 ${taskIds.length} 个节点任务已标记完成`);
  }

  await db
    .update(workflowRuns)
    .set({ status: "queued", context: ctx as unknown as Record<string, unknown> })
    .where(eq(workflowRuns.id, run.id));

  await writeAudit(db, {
    userId,
    action: "approve",
    entityType: "workflow_run",
    entityId: run.id,
    permissionLevel: "L3",
    detail: { workflow: wf.slug, step: waitingId, note, kind: step.kind },
  });

  return advanceWorkflowRun(userId, run.id);
}

function buildResult(input: {
  runId: string;
  wf: WorkflowRow;
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  status: AdvanceResult["status"];
  executed: AdvanceResult["executed"];
  needsHuman: boolean;
  humanAction: string | null;
}): AdvanceResult {
  const { runId, wf, def, ctx, status, executed, needsHuman, humanAction } = input;
  const waitingId =
    Object.entries(ctx.steps).find(([, s]) => s.status === "waiting")?.[0] ??
    firstPending(def, ctx)?.id ??
    null;
  const currentNodeTitle = waitingId
    ? (def.steps.find((s) => s.id === waitingId)?.title ?? null)
    : null;

  return {
    runId,
    workflowSlug: wf.slug,
    workflowName: wf.name,
    status,
    currentNode: waitingId,
    currentNodeTitle,
    executed,
    needsHuman,
    humanAction,
    context: ctx,
    definition: def,
    disclaimer: NO_MODEL_DISCLAIMER,
  };
}

/** 读取一次运行的当前状态（页面刷新用，不推进） */
export async function getWorkflowRun(userId: string, runId: string): Promise<AdvanceResult> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.userId, userId)))
    .limit(1);
  if (!run) throw new AppError("RUN_NOT_FOUND", "运行记录不存在或不属于当前用户", 404);

  const wf = await loadWorkflow(run.workflowId);
  const def = safeParse(wf.definition, wf.name);
  const ctx = toContext(run.context);
  const waitingId = Object.entries(ctx.steps).find(([, s]) => s.status === "waiting")?.[0];

  return buildResult({
    runId: run.id,
    wf,
    def,
    ctx,
    status: run.status,
    executed: [],
    needsHuman: Boolean(waitingId),
    humanAction: waitingId ? "该节点等待你处理" : null,
  });
}

/** 工作流列表 + 每条最近一次运行，页面首屏用 */
export async function listWorkflowsWithRuns(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(workflows)
    .where(or(isNull(workflows.userId), eq(workflows.userId, userId)))
    .orderBy(workflows.createdAt);

  const result = [];
  for (const wf of rows) {
    const [last] = await db
      .select({
        id: workflowRuns.id,
        status: workflowRuns.status,
        currentNode: workflowRuns.currentNode,
        startedAt: workflowRuns.startedAt,
        finishedAt: workflowRuns.finishedAt,
        createdAt: workflowRuns.createdAt,
      })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, wf.id), eq(workflowRuns.userId, userId)))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    let def: WorkflowDefinition | null = null;
    try {
      def = parseDefinition(wf.definition);
    } catch {
      def = null;
    }

    result.push({
      id: wf.id,
      slug: wf.slug,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled === "true",
      stepCount: def?.steps.length ?? 0,
      definitionValid: Boolean(def),
      definition: def,
      lastRun: last ?? null,
    });
  }
  return result;
}

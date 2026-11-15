import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMessages, agentRuns, agents, auditLogs, taskLogs, tasks } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { assertAllowed } from "@/server/permissions/policy";
import { getProvider, getProviderStatus } from "@/server/ai/providers";
import { getFramework, renderFramework } from "@/server/ai/agents/framework";
import type { PermissionLevel } from "@/types";

/**
 * 文档 5.3 Agent 执行流程的落地实现。
 *
 * 已实现：选择 Agent → 检查权限与预算 → 执行 → 保存执行日志 → 质量检查 → 提交待确认
 * 未实现：交叉审核（需要第二个 Agent 独立复核，留到工作流引擎）
 *
 * 三条不可违反的约束：
 * 1. 没有模型时绝不冒充 AI 执行——产出「研究框架」并标记 mode=framework、hasConclusion=false。
 * 2. Agent 不能自行提权：执行前按 Agent 自己的 permissionLevel 做 assertAllowed。
 * 3. 执行成功不等于任务完成：任务只到 review，必须人工确认才 done。
 */

export type ExecuteMode = "framework" | "mock" | "model";

export interface ExecuteResult {
  runId: string;
  taskId: string;
  agentSlug: string;
  agentName: string;
  mode: ExecuteMode;
  /** 是否是真实模型产出 */
  isRealAI: boolean;
  /** 是否包含研究结论（框架模式恒为 false） */
  hasConclusion: boolean;
  output: string;
  quality: { pass: boolean; issues: string[] };
  durationMs: number;
  taskStatus: string;
  disclaimer: string;
}

/** Agent 执行结果的质量检查：不通过则任务停在 review 并记录问题 */
function checkQuality(output: string, mode: ExecuteMode): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  if (output.trim().length < 50) issues.push("产出过短，无法作为可验收成果");
  if (mode === "framework" && !output.includes("研究框架")) {
    issues.push("框架模式产出缺少「研究框架」标记，可能与真实结论混淆");
  }
  if (mode === "mock" && !output.includes("模拟输出")) {
    issues.push("模拟模式产出未标注「模拟输出」，违反不得冒充真实 AI 的要求");
  }
  if (mode === "framework" && /结论[:：]\s*\S/.test(output)) {
    issues.push("框架模式不应包含结论字段");
  }
  return { pass: issues.length === 0, issues };
}

export interface ExecuteOptions {
  userId: string;
  taskId: string;
  /** 指定 Agent slug；缺省用任务上已分配的 Agent */
  agentSlug?: string;
  /** 触发来源，写入审计日志 */
  trigger: string;
}

export async function executeTask(options: ExecuteOptions): Promise<ExecuteResult> {
  const db = getDb();
  const { userId, taskId, trigger } = options;
  const startedAt = Date.now();

  // ── 1. 读任务，校验归属 ──────────────────────────────────
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  if (!task) {
    throw new AppError("TASK_NOT_FOUND", "任务不存在或不属于当前用户", 404);
  }

  // ── 2. 选择 Agent ────────────────────────────────────────
  const slug = options.agentSlug ?? task.agentSlug ?? "supervisor";
  const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
  if (!agent) {
    throw new AppError(
      "AGENT_NOT_FOUND",
      `未找到 Agent「${slug}」。可用的 Agent 见 Agent 中心。`,
      404,
    );
  }
  if (agent.status !== "ready" && agent.status !== "active") {
    throw new AppError("AGENT_UNAVAILABLE", `Agent「${agent.name}」当前状态为 ${agent.status}，不可执行`, 409);
  }

  // ── 3. 检查权限（Agent 不得自行提权）──────────────────────
  assertAllowed(agent.permissionLevel as PermissionLevel, "analyze");

  // ── 4. 检查执行次数上限（文档 5.4）────────────────────────
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(and(eq(agentRuns.taskId, taskId), eq(agentRuns.agentId, agent.id)));
  const usedCount = used?.n ?? 0;
  if (usedCount >= agent.maxRunsPerTask) {
    throw new AppError(
      "RUN_LIMIT_EXCEEDED",
      `该任务已被「${agent.name}」执行 ${usedCount} 次，达到上限 ${agent.maxRunsPerTask} 次。` +
        `为避免无限调用，已阻止继续执行；如确需重跑，请新建任务或调整该 Agent 的执行上限。`,
      429,
    );
  }

  // ── 5. 原子占位：并发请求只允许一个拿到执行权 ──────────────
  // 用条件更新实现乐观锁，避免「先查询后写入」的竞态。
  const claimed = await db
    .update(tasks)
    .set({ status: "running", agentSlug: agent.slug, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), sql`${tasks.status} <> 'running'`))
    .returning({ id: tasks.id });

  if (claimed.length === 0) {
    throw new AppError(
      "TASK_ALREADY_RUNNING",
      "该任务正在执行中，请等待本次执行结束后再试。",
      409,
    );
  }

  // ── 6. 建 run 记录 ───────────────────────────────────────
  const status = getProviderStatus();
  const [run] = await db
    .insert(agentRuns)
    .values({
      agentId: agent.id,
      userId,
      taskId,
      status: "running",
      provider: status.mode,
      startedAt: new Date(),
    })
    .returning();

  const finishFail = async (message: string) => {
    await db
      .update(agentRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(agentRuns.id, run.id));
    await db
      .update(tasks)
      .set({ status: "blocked", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await db.insert(taskLogs).values({
      taskId,
      level: "error",
      message,
      durationMs: Date.now() - startedAt,
    });
    await db.insert(auditLogs).values({
      userId,
      action: "run",
      entityType: "task",
      entityId: taskId,
      permissionLevel: agent.permissionLevel as PermissionLevel,
      detail: { trigger, agent: agent.slug, runId: run.id, result: "failed", error: message },
    });
  };

  // ── 7. 执行（带超时保护）──────────────────────────────────
  const taskPrompt = [
    `任务：${task.title}`,
    task.detail ? `验收标准：${task.detail}` : "",
    task.projectId ? `所属项目：${task.projectId}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let mode: ExecuteMode;
  let output: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const provider = getProvider();

    if (provider) {
      // 有 Provider（当前只有 mock）：真实走一遍调用链路
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AppError("AGENT_TIMEOUT", `执行超过 ${agent.timeoutSeconds} 秒，已中止`, 504)),
          agent.timeoutSeconds * 1000,
        ),
      );
      const res = await Promise.race([
        provider.generate({
          systemPrompt: agent.systemInstructions || agent.description,
          messages: [{ role: "user", content: taskPrompt }],
        }),
        timeout,
      ]);
      output = res.content;
      inputTokens = res.usage?.inputTokens ?? 0;
      outputTokens = res.usage?.outputTokens ?? 0;
      mode = provider.isReal ? "model" : "mock";
    } else {
      // 无模型：产出确定性的研究框架，并明确标注不含结论
      const fw = getFramework(agent.slug);
      output = [
        renderFramework(agent.name, fw),
        "",
        "———",
        "说明：当前未接入任何 AI 模型（AI_PROVIDER=none），本产出由内置研究流程模板生成，",
        "不是模型推理结果，不包含任何研究结论或数据。请按上面的问题清单去收集证据后填写。",
      ].join("\n");
      mode = "framework";
    }
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "执行失败";
    await finishFail(message);
    throw error instanceof AppError ? error : new AppError("AGENT_RUN_FAILED", message, 500);
  }

  // ── 8. 保存执行记录（agent_messages）──────────────────────
  const runId = run.id;
  await db.insert(agentMessages).values([
    { runId, agentId: agent.id, role: "user", content: taskPrompt },
    { runId, agentId: agent.id, role: "assistant", content: output },
  ]);

  // ── 9. 质量检查（文档 5.3 第 8 步）─────────────────────────
  const quality = checkQuality(output, mode);
  const durationMs = Date.now() - startedAt;

  // ── 10. 收尾：run 成功、任务进 review 等人工确认 ────────────
  await db
    .update(agentRuns)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      inputTokens,
      outputTokens,
    })
    .where(eq(agentRuns.id, runId));

  await db
    .update(tasks)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  await db.insert(taskLogs).values({
    taskId,
    level: quality.pass ? "info" : "warn",
    message: quality.pass
      ? `「${agent.name}」执行完成（${mode}），产出待人工确认`
      : `「${agent.name}」执行完成但质量检查未通过：${quality.issues.join("；")}`,
    durationMs,
  });

  await db.insert(auditLogs).values({
    userId,
    action: "run",
    entityType: "task",
    entityId: taskId,
    permissionLevel: agent.permissionLevel as PermissionLevel,
    detail: {
      trigger,
      agent: agent.slug,
      runId,
      mode,
      quality: quality.pass ? "pass" : "fail",
      durationMs,
    },
  });

  const disclaimer =
    mode === "framework"
      ? "未调用任何模型，产出为内置研究流程框架，不含研究结论，不产生费用。"
      : mode === "mock"
        ? "本次为本地模拟调用，产出不是真实 AI 结果，不得作为研究结论。"
        : "本次由真实模型生成，结论仍需人工核验来源。";

  return {
    runId,
    taskId,
    agentSlug: agent.slug,
    agentName: agent.name,
    mode,
    isRealAI: mode === "model",
    hasConclusion: mode !== "framework",
    output,
    quality,
    durationMs,
    taskStatus: "review",
    disclaimer,
  };
}

/** 读取某个任务的执行历史（Agent 中心与任务详情都要用） */
export async function listTaskRuns(userId: string, taskId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      provider: agentRuns.provider,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      error: agentRuns.error,
      agentName: agents.name,
      agentSlug: agents.slug,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.taskId, taskId)))
    .orderBy(agentRuns.createdAt);
  return rows;
}

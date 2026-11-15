import "server-only";
import { executeTask } from "./executor";
import type { PlanStep } from "./planner";

/**
 * 总管家调度（文档 5.1：理解目标 → 拆解 → 分配 → 汇总）。
 *
 * 边界写死在这里：
 * 1. **只跑有 Agent 的步骤**。供应链、合规这类没有对应 Agent 的环节，
 *    任务留在 pending 并标「需人工执行」，不能假装有人跑过。
 * 2. **单个失败不中断整批**。第 2 步失败就把第 3–6 步一起扔掉，
 *    用户还得重新拆一次；失败单独记下来，其余照跑。
 * 3. **执行成功 ≠ 任务完成**。executor 里任务只到 review，
 *    必须人工确认才 done——调度器不越权替人拍板。
 *
 * ⚠ 当前是同步执行：框架/模拟模式都在毫秒级，一批 6 条没有问题。
 * 接入真实模型后单条可能几十秒，必须改成后台队列（否则 HTTP 请求会超时）。
 */

export interface DispatchOutcome {
  taskId: string;
  title: string;
  agentSlug: string;
  agentName: string;
  /** succeeded = Agent 跑完并产出；failed = 执行报错；skipped = 没有对应 Agent */
  status: "succeeded" | "failed" | "skipped";
  /** 失败原因或跳过原因 */
  reason?: string;
  runId?: string;
  mode?: string;
  /** 产出字符数，用来判断这次到底有没有东西 */
  outputChars?: number;
  /** 执行后任务所处状态，正常应为 review（待确认） */
  taskStatus?: string;
}

export interface DispatchSummary {
  outcomes: DispatchOutcome[];
  succeeded: number;
  failed: number;
  skipped: number;
  /** 产出总字符数 */
  outputChars: number;
  note: string;
}

export async function dispatchPlan(
  userId: string,
  steps: PlanStep[],
  created: { id: string; title: string }[],
): Promise<DispatchSummary> {
  const byTitle = new Map(created.map((c) => [c.title, c.id]));
  const outcomes: DispatchOutcome[] = [];

  for (const step of steps) {
    const taskId = byTitle.get(step.title);
    const base = {
      taskId: taskId ?? "",
      title: step.title,
      agentSlug: step.agentSlug,
      agentName: step.agentName,
    };

    if (!taskId) {
      outcomes.push({ ...base, status: "skipped", reason: "任务未成功写入，无法派发" });
      continue;
    }

    if (step.manual || !step.agentSlug) {
      outcomes.push({ ...base, status: "skipped", reason: "这一步没有对应 Agent，需要人工执行" });
      continue;
    }

    try {
      const result = await executeTask({
        userId,
        taskId,
        agentSlug: step.agentSlug,
        trigger: "assistant",
      });
      outcomes.push({
        ...base,
        status: "succeeded",
        runId: result.runId,
        mode: result.mode,
        outputChars: result.output.length,
        taskStatus: result.taskStatus,
      });
    } catch (error) {
      outcomes.push({
        ...base,
        status: "failed",
        reason: error instanceof Error ? error.message : "执行失败",
      });
    }
  }

  const succeeded = outcomes.filter((o) => o.status === "succeeded").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const outputChars = outcomes.reduce((sum, o) => sum + (o.outputChars ?? 0), 0);

  return {
    outcomes,
    succeeded,
    failed,
    skipped,
    outputChars,
    note:
      `调度完成：${succeeded} 条跑完、${failed} 条失败、${skipped} 条需人工。` +
      (succeeded > 0 ? "跑完的任务停在「待确认」，需要你确认才算完成。" : ""),
  };
}

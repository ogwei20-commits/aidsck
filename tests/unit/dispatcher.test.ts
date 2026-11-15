import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanStep } from "@/server/ai/orchestrator/planner";

/**
 * 调度器：只验证「谁被派出去、失败是否中断、无 Agent 是否跳过」。
 * executor 用 mock 替换——真正执行链路由 run.test.ts 覆盖，这里不该重复跑一遍。
 */

const executeTask = vi.fn();

vi.mock("@/server/ai/orchestrator/executor", () => ({
  executeTask: (...args: unknown[]) => executeTask(...args),
}));

const { dispatchPlan } = await import("@/server/ai/orchestrator/dispatcher");

function step(title: string, agentSlug: string, manual = false): PlanStep {
  return {
    title,
    detail: "细节",
    agentSlug,
    agentName: manual ? "人工执行" : "Market Analyst",
    permissionLevel: "L1",
    priority: 1,
    manual,
  };
}

describe("总管家调度", () => {
  beforeEach(() => {
    executeTask.mockReset();
  });

  it("有 Agent 的步骤逐条派发，无 Agent 的留在人工", async () => {
    executeTask.mockResolvedValue({
      runId: "run-1",
      mode: "framework",
      output: "框架".repeat(100),
      taskStatus: "review",
    });

    const steps = [step("市场研究", "market-analyst"), step("供应链研究", "supply-chain", true)];
    const created = steps.map((s, i) => ({ id: `task-${i}`, title: s.title }));

    const result = await dispatchPlan("user-1", steps, created);

    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.outcomes[1]).toMatchObject({ status: "skipped", taskId: "task-1" });
    expect(result.outcomes[1].reason).toContain("人工");
  });

  it("单条失败不中断后面的步骤", async () => {
    executeTask
      .mockRejectedValueOnce(new Error("provider 503"))
      .mockResolvedValueOnce({ runId: "run-2", mode: "framework", output: "ok", taskStatus: "review" });

    const steps = [step("第一步", "market-analyst"), step("第二步", "finance-analyst")];
    const created = steps.map((s, i) => ({ id: `t-${i}`, title: s.title }));

    const result = await dispatchPlan("user-1", steps, created);

    expect(executeTask).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.outcomes[0].reason).toBe("provider 503");
    expect(result.outcomes[1].runId).toBe("run-2");
  });

  it("任务没写进库时跳过，不拿空 id 去执行", async () => {
    const steps = [step("市场研究", "market-analyst")];
    const result = await dispatchPlan("user-1", steps, []);

    expect(executeTask).not.toHaveBeenCalled();
    expect(result.outcomes[0]).toMatchObject({ status: "skipped", taskId: "" });
  });

  it("成功不等于完成：任务状态如实回传 review", async () => {
    executeTask.mockResolvedValue({
      runId: "run-3",
      mode: "framework",
      output: "x".repeat(80),
      taskStatus: "review",
    });
    const result = await dispatchPlan("user-1", [step("市场研究", "market-analyst")], [
      { id: "t-1", title: "市场研究" },
    ]);

    expect(result.outcomes[0].taskStatus).toBe("review");
    expect(result.note).toContain("待确认");
    expect(result.outputChars).toBe(80);
  });
});

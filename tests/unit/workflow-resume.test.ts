import { describe, expect, it } from "vitest";
import {
  MAX_RETRY_ATTEMPTS,
  appendResume,
  attemptCount,
  checkResumable,
  definitionDigest,
  findFailedStep,
  prepareRetry,
  prepareSkip,
  type ResumeRecord,
} from "@/server/ai/workflows/resume";
import type { StepState, WorkflowContext, WorkflowDefinition } from "@/server/ai/workflows/types";

/**
 * 续跑的判定与状态迁移。
 *
 * 这些用例针对的都是「错了不容易被发现」的地方：
 * 定义改过之后还接着跑、把人工闸门跳过、无限重试、重试时把上次的落库记录弄丢。
 */

function makeDef(over: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    version: 1,
    deliverable: "测试用流程",
    steps: [
      { id: "s1", title: "准备", kind: "start", description: "" },
      { id: "s2", title: "研究", kind: "agent", description: "", agentSlug: "researcher" },
      { id: "s3", title: "审核", kind: "gate", description: "" },
      { id: "s4", title: "归档", kind: "archive", description: "" },
    ],
    ...over,
  };
}

function makeCtx(over: Partial<WorkflowContext> = {}): WorkflowContext {
  const def = makeDef();
  const steps: Record<string, StepState> = {};
  for (const s of def.steps) steps[s.id] = { status: "pending" };
  return {
    goal: "测试目标",
    steps,
    log: [],
    definitionDigest: definitionDigest(def),
    ...over,
  };
}

describe("定义指纹", () => {
  it("同一份定义得到同一个指纹", () => {
    expect(definitionDigest(makeDef())).toBe(definitionDigest(makeDef()));
  });

  it("改执行者或节点顺序，指纹就变", () => {
    const base = definitionDigest(makeDef());
    const changedAgent = makeDef({
      steps: makeDef().steps.map((s) => (s.id === "s2" ? { ...s, agentSlug: "other" } : s)),
    });
    const reordered = makeDef({ steps: [...makeDef().steps].reverse() });
    expect(definitionDigest(changedAgent)).not.toBe(base);
    expect(definitionDigest(reordered)).not.toBe(base);
  });
});

describe("找失败节点", () => {
  it("按定义顺序返回第一个 failed，不返回 skipped", () => {
    const ctx = makeCtx();
    ctx.steps.s1 = { status: "succeeded" };
    ctx.steps.s2 = { status: "skipped", reason: "人工跳过：不需要" };
    ctx.steps.s3 = { status: "failed", note: "闸门执行异常" };
    expect(findFailedStep(makeDef(), ctx)?.step.id).toBe("s3");
  });

  it("没有失败节点时返回 null", () => {
    expect(findFailedStep(makeDef(), makeCtx())).toBeNull();
  });
});

describe("能不能续跑", () => {
  const failedCtx = () => {
    const ctx = makeCtx();
    ctx.steps.s1 = { status: "succeeded" };
    ctx.steps.s2 = { status: "failed", note: "模型调用超时" };
    return ctx;
  };

  it("只有 failed 的运行能续跑", () => {
    const ctx = failedCtx();
    for (const status of ["queued", "succeeded", "cancelled"]) {
      const r = checkResumable({ def: makeDef(), ctx, runStatus: status, action: "retry", note: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("RUN_NOT_RESUMABLE");
    }
  });

  it("正在执行的运行不能续跑，避免两个请求同时推进", () => {
    const r = checkResumable({ def: makeDef(), ctx: failedCtx(), runStatus: "running", action: "retry", note: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RUN_BUSY");
  });

  it("定义被改过就拒绝续跑，并说明该怎么办", () => {
    const ctx = failedCtx();
    const changed = makeDef({ steps: makeDef().steps.slice(0, 3) }); // 少了一个节点
    const r = checkResumable({ def: changed, ctx, runStatus: "failed", action: "retry", note: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("WORKFLOW_DEFINITION_CHANGED");
      expect(r.message).toContain("重新启动");
    }
  });

  it("老运行没记指纹时，退一步比对节点集合", () => {
    const ctx = failedCtx();
    delete ctx.definitionDigest;
    const changed = makeDef({ steps: makeDef().steps.slice(0, 3) });
    const r = checkResumable({ def: changed, ctx, runStatus: "failed", action: "retry", note: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("WORKFLOW_DEFINITION_CHANGED");
  });

  it("没有失败节点时明确说无需续跑", () => {
    const r = checkResumable({ def: makeDef(), ctx: makeCtx(), runStatus: "failed", action: "retry", note: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RUN_NO_FAILED_STEP");
  });

  it(`重试到第 ${MAX_RETRY_ATTEMPTS} 次仍失败就停下，不无限重试`, () => {
    const ctx = failedCtx();
    ctx.steps.s2 = { status: "failed", note: "还是失败", attempts: MAX_RETRY_ATTEMPTS + 1 };
    const r = checkResumable({ def: makeDef(), ctx, runStatus: "failed", action: "retry", note: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("RESUME_LIMIT_REACHED");
      expect(r.message).toContain("跳过");
    }
  });

  it("未达上限可以继续重试", () => {
    const ctx = failedCtx();
    ctx.steps.s2 = { status: "failed", note: "第一次失败", attempts: MAX_RETRY_ATTEMPTS };
    const r = checkResumable({ def: makeDef(), ctx, runStatus: "failed", action: "retry", note: "" });
    expect(r.ok).toBe(true);
  });

  it("人工闸门不许跳过——闸门的全部意义就是不可绕过", () => {
    const ctx = makeCtx();
    ctx.steps.s3 = { status: "failed", note: "闸门异常" };
    const r = checkResumable({ def: makeDef(), ctx, runStatus: "failed", action: "skip", note: "先放着" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GATE_CANNOT_SKIP");
  });

  it("跳过必须写原因，太短不放过", () => {
    const ctx = failedCtx();
    const r = checkResumable({ def: makeDef(), ctx, runStatus: "failed", action: "skip", note: "跳过" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RESUME_NOTE_REQUIRED");
  });

  it("写了原因就可以跳过", () => {
    const ctx = failedCtx();
    const r = checkResumable({
      def: makeDef(),
      ctx,
      runStatus: "failed",
      action: "skip",
      note: "这一步依赖的第三方接口已下线",
    });
    expect(r.ok).toBe(true);
  });
});

describe("重试的状态迁移", () => {
  it("回到 pending、次数 +1，并记住上次的错", () => {
    const next = prepareRetry({
      status: "failed",
      note: "ECONNRESET",
      finishedAt: "2026-11-15T04:00:00.000Z",
    });
    expect(next.status).toBe("pending");
    expect(next.attempts).toBe(2);
    expect(next.lastError?.message).toBe("ECONNRESET");
    expect(next.output).toBeUndefined();
  });

  it("保住上次的任务与落库记录，重试不另起一份", () => {
    const next = prepareRetry({
      status: "failed",
      note: "写审计时失败",
      taskId: "task-1",
      runId: "agent-run-1",
      recordId: "report-1",
    });
    expect(next.taskId).toBe("task-1");
    expect(next.runId).toBe("agent-run-1");
    expect(next.recordId).toBe("report-1");
  });

  it("首次执行没有 attempts 字段时按 1 计，重试后是 2", () => {
    expect(attemptCount(undefined)).toBe(1);
    expect(attemptCount({ status: "failed" })).toBe(1);
    expect(prepareRetry({ status: "failed" }).attempts).toBe(2);
  });
});

describe("跳过的状态迁移", () => {
  it("标 skipped 并在原因里带上原来的失败，事后能对上", () => {
    const step = makeDef().steps[1];
    const next = prepareSkip(step, { status: "failed", note: "接口 502" }, "这个数据源已不可用");
    expect(next.status).toBe("skipped");
    expect(next.reason).toContain("人工跳过：这个数据源已不可用");
    expect(next.reason).toContain("原失败：接口 502");
    expect(next.lastError?.message).toBe("接口 502");
    expect(next.note).toBeUndefined();
  });
});

describe("续跑记录", () => {
  it("按顺序追加，最多留 20 条", () => {
    let records: ResumeRecord[] = [];
    for (let i = 0; i < 25; i += 1) {
      records = appendResume({ goal: "", steps: {}, log: [], resumes: records }, {
        at: new Date(2026, 0, 1, 0, i).toISOString(),
        stepId: "s2",
        stepTitle: "研究",
        action: i % 2 === 0 ? "retry" : "skip",
        attempt: i + 1,
        note: "",
      });
    }
    expect(records).toHaveLength(20);
    expect(records[19].attempt).toBe(25);
  });
});

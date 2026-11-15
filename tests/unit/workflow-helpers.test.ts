import { describe, expect, it } from "vitest";
import { parseDefinition } from "@/server/ai/workflows/definitions";
import { buildReport, buildSummary, runChecks } from "@/server/ai/workflows/helpers";
import type { WorkflowContext, WorkflowDefinition } from "@/server/ai/workflows/types";

const def: WorkflowDefinition = {
  version: 1,
  deliverable: "测试交付物",
  steps: [
    { id: "s1", title: "准备", kind: "start", description: "" },
    { id: "s2", title: "市场", kind: "agent", description: "", agentSlug: "market-analyst" },
    { id: "s3", title: "汇总", kind: "summary", description: "" },
    { id: "s4", title: "核对", kind: "check", description: "", checks: ["coverage", "evidence"] },
  ],
};

function ctxWith(steps: WorkflowContext["steps"]): WorkflowContext {
  return { goal: "测试目标", steps, log: [] };
}

describe("工作流定义解析", () => {
  it("解析正常的定义", () => {
    const parsed = parseDefinition(def);
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.steps[1].agentSlug).toBe("market-analyst");
  });

  it("缺少 steps 直接拒绝", () => {
    expect(() => parseDefinition({ version: 1 })).toThrow(/缺少 steps/);
  });

  it("节点 id 重复直接拒绝", () => {
    expect(() =>
      parseDefinition({
        version: 1,
        steps: [
          { id: "s1", title: "A", kind: "start" },
          { id: "s1", title: "B", kind: "start" },
        ],
      }),
    ).toThrow(/id 重复/);
  });

  it("agent 节点缺 agentSlug 直接拒绝", () => {
    expect(() =>
      parseDefinition({ version: 1, steps: [{ id: "s1", title: "A", kind: "agent" }] }),
    ).toThrow(/未指定 agentSlug/);
  });

  it("标为不执行的节点必须写明原因", () => {
    expect(() =>
      parseDefinition({ version: 1, steps: [{ id: "s1", title: "A", kind: "deferred" }] }),
    ).toThrow(/没写原因/);
  });
});

describe("汇总与报告不产生新结论", () => {
  const ctx = ctxWith({
    s1: { status: "succeeded", output: "项目已就绪" },
    s2: { status: "succeeded", output: "市场框架：需要回答 3 个问题", mode: "framework" },
    s3: { status: "pending" },
    s4: { status: "pending" },
  });

  it("汇总按节点顺序拼接，并声明不含新分析", () => {
    const text = buildSummary(def, ctx, "测试流程");
    expect(text).toContain("不含新的分析或结论");
    expect(text).toContain("## 市场");
    expect(text).toContain("需要回答 3 个问题");
    // start 节点不是 agent 节点，不进汇总
    expect(text).not.toContain("项目已就绪");
  });

  it("报告正文明确写出结论状态，不冒充结论", () => {
    const report = buildReport({
      workflowName: "测试流程",
      goal: "测试目标",
      def,
      ctx,
      projectId: "11111111-1111-1111-1111-111111111111",
      generatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(report.title).toContain("研究报告");
    expect(report.body).toContain("尚无经人工确认的研究结论");
    expect(report.body).toContain("不是研究结论");
    expect(report.body).toContain("测试目标");
  });
});

describe("核对规则", () => {
  it("没有产出的环节会被阻断", () => {
    const result = runChecks(def, ctxWith({ s2: { status: "pending" } }), ["coverage"]);
    expect(result.blocking.length).toBeGreaterThan(0);
    expect(result.blocking[0]).toContain("没有可用产出");
  });

  it("框架产出没有实测数据时只给提示，不阻断", () => {
    const result = runChecks(
      def,
      ctxWith({ s2: { status: "succeeded", output: "期望数据类型：R", mode: "framework" } }),
      ["coverage", "evidence", "no-fake-conclusion"],
    );
    expect(result.blocking).toHaveLength(0);
    expect(result.advisory.some((a) => a.includes("框架产出"))).toBe(true);
  });

  it("框架产出里出现「结论：」会被判为冒充结论", () => {
    const result = runChecks(
      def,
      ctxWith({ s2: { status: "succeeded", output: "数据类型：R\n结论：这个品类能做", mode: "framework" } }),
      ["no-fake-conclusion"],
    );
    expect(result.blocking.some((b) => b.includes("冒充") || b.includes("误当"))).toBe(true);
  });

  it("缺少数据类型标注会被阻断", () => {
    const result = runChecks(
      def,
      ctxWith({ s2: { status: "succeeded", output: "这里有来源说明，但没有类型标注", mode: "model" } }),
      ["evidence"],
    );
    expect(result.blocking.some((b) => b.includes("未标注数据类型"))).toBe(true);
  });

  it("多个环节都是框架产出时合并成一条提示，不重复刷屏", () => {
    const multi: WorkflowDefinition = {
      version: 1,
      deliverable: "",
      steps: [
        { id: "a1", title: "环节一", kind: "agent", description: "", agentSlug: "market-analyst" },
        { id: "a2", title: "环节二", kind: "agent", description: "", agentSlug: "platform-analyst" },
      ],
    };
    const result = runChecks(
      multi,
      ctxWith({
        a1: { status: "succeeded", output: "期望数据类型：R", mode: "framework" },
        a2: { status: "succeeded", output: "期望数据类型：E", mode: "framework" },
      }),
      ["coverage", "evidence"],
    );
    const frameworkNotes = result.advisory.filter((a) => a.includes("框架产出"));
    expect(frameworkNotes).toHaveLength(1);
    expect(frameworkNotes[0]).toContain("2 个环节");
  });

  it("只做追溯性核对时不重复框架提示", () => {
    const result = runChecks(
      def,
      ctxWith({ s2: { status: "succeeded", output: "所需证据：行业报告；数据类型：R", mode: "framework" } }),
      ["traceability"],
    );
    expect(result.advisory.filter((a) => a.includes("框架产出"))).toHaveLength(0);
  });

  it("缺少来源说明只给提示", () => {
    const result = runChecks(
      def,
      ctxWith({ s2: { status: "succeeded", output: "数据类型：R，市场规模很大", mode: "model" } }),
      ["traceability"],
    );
    expect(result.blocking).toHaveLength(0);
    expect(result.advisory.some((a) => a.includes("缺少来源"))).toBe(true);
  });
});

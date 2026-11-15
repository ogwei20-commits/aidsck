import { describe, expect, it } from "vitest";
import { AGENT_REGISTRY } from "@/server/ai/agents/registry";
import { getFramework, renderFramework } from "@/server/ai/agents/framework";

describe("Agent 研究框架（无模型时的真实产出物）", () => {
  it("六个注册 Agent 都有专属框架，不是同一份模板套六次", () => {
    const deliverables = new Set<string>();
    for (const agent of AGENT_REGISTRY) {
      const fw = getFramework(agent.agentId);
      expect(fw.questions.length).toBeGreaterThanOrEqual(3);
      expect(fw.acceptance.length).toBeGreaterThanOrEqual(2);
      expect(fw.pitfalls.length).toBeGreaterThanOrEqual(1);
      deliverables.add(fw.deliverable);
    }
    // 六份产出物两两不同，说明确实是按职责写的
    expect(deliverables.size).toBe(AGENT_REGISTRY.length);
  });

  it("每个问题都绑定证据来源与数据类型", () => {
    for (const agent of AGENT_REGISTRY) {
      for (const q of getFramework(agent.agentId).questions) {
        expect(q.q.length).toBeGreaterThan(6);
        expect(q.evidence.length).toBeGreaterThan(4);
        expect(["R", "E", "P", "S", "U"]).toContain(q.dataType);
      }
    }
  });

  it("未知 Agent 退回通用框架，而不是报错或返回空", () => {
    const fw = getFramework("not-registered");
    expect(fw.questions.length).toBeGreaterThan(0);
    expect(fw.deliverable).toContain("通用");
  });

  it("渲染结果带「研究框架」标记，且不含任何结论字段", () => {
    for (const agent of AGENT_REGISTRY) {
      const text = renderFramework(agent.name, getFramework(agent.agentId));
      expect(text).toContain("研究框架");
      expect(text).toContain("验收标准");
      // 框架不得含结论，否则会被误当作研究结果
      expect(text).not.toMatch(/结论[:：]/);
    }
  });

  it("框架不含具体数字结论，避免被当成真实数据", () => {
    const fw = getFramework("market-analyst");
    const text = renderFramework("Market Analyst", fw);
    // 允许出现「12 个月」这类方法说明，但不能出现百分比或金额结论
    expect(text).not.toMatch(/\d+\.\d+%/);
    expect(text).not.toMatch(/净利[^\n]{0,6}\d/);
  });
});

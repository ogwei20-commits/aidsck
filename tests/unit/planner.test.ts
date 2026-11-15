import { describe, expect, it } from "vitest";
import { planTarget } from "@/server/ai/orchestrator/planner";

describe("目标拆解", () => {
  it("只提到平台时，补齐可行性链上的其余环节", () => {
    const plan = planTarget("比较一下亚马逊和 TikTok Shop");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps.some((s) => s.agentSlug === "platform-analyst")).toBe(true);
    // 补齐的必要环节应包含财务与市场
    expect(plan.steps.some((s) => s.agentSlug === "finance-analyst")).toBe(true);
    expect(plan.steps.some((s) => s.agentSlug === "market-analyst")).toBe(true);
  });

  it("没有命中关键词时给完整默认链", () => {
    const plan = planTarget("随便看看");
    expect(plan.steps).toHaveLength(4);
    expect(plan.note).toContain("内置流程模板");
  });

  it("没有对应 Agent 的环节必须标记为人工执行", () => {
    const plan = planTarget("帮我查一下美国宠物食品的 FDA 合规要求");
    const compliance = plan.steps.find((s) => s.agentSlug === "compliance");
    expect(compliance).toBeDefined();
    expect(compliance?.manual).toBe(true);
  });

  it("同一 Agent 不会重复出任务", () => {
    const plan = planTarget("市场和需求都要研究，市场趋势也要看");
    const slugs = plan.steps.map((s) => s.agentSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("永远标注来源为规则模板，不冒充模型输出", () => {
    const plan = planTarget("想在美国卖宠物零食");
    expect(plan.mode).toBe("rule-template");
    expect(plan.note).toContain("不是模型推理");
  });

  it("优先级从高到低排序", () => {
    const plan = planTarget("市场、平台、财务、供应链全都要看");
    const priorities = plan.steps.map((s) => s.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });
});

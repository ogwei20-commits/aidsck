import { describe, expect, it } from "vitest";
import { AGENT_REGISTRY } from "@/server/ai/agents/registry";
import { getProviderStatus } from "@/server/ai/providers";
import { isToolAllowed } from "@/server/ai/tools/registry";
import { assertAllowed } from "@/server/permissions/policy";

describe("权限分级与 AI 边界（文档 5.4 / 9.1）", () => {
  it("L4 一律拒绝，禁止 AI 自主执行", () => {
    expect(() => assertAllowed("L4", "read")).toThrow();
  });

  it("L1 只能查询，不能写入", () => {
    expect(() => assertAllowed("L1", "read")).not.toThrow();
    expect(() => assertAllowed("L1", "create")).toThrow();
  });

  it("L2 可以创建与计算", () => {
    expect(() => assertAllowed("L2", "create")).not.toThrow();
  });

  it("外部调用工具即使在 L3 也被禁止", () => {
    expect(isToolAllowed("external_call", "L3")).toBe(false);
  });

  it("未实现的工具不可被调用", () => {
    expect(isToolAllowed("finance.calculate", "L2")).toBe(false);
  });

  it("已实现的写入工具在 L2 可用", () => {
    expect(isToolAllowed("task.create", "L2")).toBe(true);
  });

  it("默认 AI Provider 为 none，且不冒充真实 AI", () => {
    const status = getProviderStatus();
    expect(status.configured).toBe(false);
    expect(status.isReal).toBe(false);
    expect(status.mode).toBe("none");
  });

  it("六个核心 Agent 均为规划态，且执行限制齐备", () => {
    expect(AGENT_REGISTRY).toHaveLength(6);
    for (const agent of AGENT_REGISTRY) {
      expect(agent.status).toBe("planned");
      expect(agent.executionLimit).toBeGreaterThan(0);
      expect(agent.maxModelCalls).toBeGreaterThan(0);
      expect(agent.timeoutSeconds).toBeGreaterThan(0);
      expect(agent.allowedTools.every((t) => !t.startsWith("external"))).toBe(true);
    }
  });
});

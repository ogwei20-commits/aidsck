import type { PermissionLevel } from "@/types";

/**
 * 文档 5.1/5.2：第一阶段六个核心 Agent 的标准定义。
 *
 * 状态说明：这六个 Agent 已落库（agents 表）并接入调度器，
 * 可通过 POST /api/v1/agents/:slug/run 或 POST /api/v1/tasks/:id/run 真实执行。
 * 本文件是「默认定义 / 迁移参照」，运行时以数据库中 agents 表为准。
 */
export interface AgentDefinition {
  agentId: string;
  name: string;
  description: string;
  role: string;
  systemInstructions: string;
  allowedTools: readonly string[];
  permissionLevel: PermissionLevel;
  executionLimit: number;
  maxModelCalls: number;
  timeoutSeconds: number;
  status: "planned" | "active";
  version: string;
  inputSchema: string;
  outputSchema: string;
}

const BASE_LIMITS = {
  executionLimit: 5,
  maxModelCalls: 10,
  timeoutSeconds: 120,
  status: "active" as const,
  version: "1.0.0",
  inputSchema: "AgentTaskInput { taskId, target? }",
  outputSchema: "AgentTaskOutput { mode, output, hasConclusion }",
};

export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  {
    ...BASE_LIMITS,
    agentId: "supervisor",
    name: "Supervisor Agent",
    description: "AI 总管家：理解目标、拆解任务、分配 Agent、汇总结果",
    role: "orchestrator",
    systemInstructions: "只做规划与调度；不得自行提权、不得购买付费服务、不得外发未授权数据。",
    allowedTools: ["task.create", "project.read", "approval.request"],
    permissionLevel: "L2",
  },
  {
    ...BASE_LIMITS,
    agentId: "market-analyst",
    name: "Market Analyst",
    description: "市场研究：市场规模、趋势、来源与证据",
    role: "research",
    systemInstructions: "所有结论必须关联来源，并标注 R/E/P/S/U 数据类型。",
    allowedTools: ["research.read", "knowledge.read"],
    permissionLevel: "L1",
  },
  {
    ...BASE_LIMITS,
    agentId: "platform-analyst",
    name: "Platform Analyst",
    description: "平台比较：平台档案、费用、规则与比较报告",
    role: "research",
    systemInstructions: "平台数据须标注来源与采集时间，区分真实数据与估算数据。",
    allowedTools: ["research.read", "knowledge.read"],
    permissionLevel: "L1",
  },
  {
    ...BASE_LIMITS,
    agentId: "product-researcher",
    name: "Product Researcher",
    description: "选品研究：产品档案、竞品分析与评分",
    role: "research",
    systemInstructions: "竞品数据须关联来源；评分须说明权重与假设。",
    allowedTools: ["research.read", "product.read", "knowledge.read"],
    permissionLevel: "L1",
  },
  {
    ...BASE_LIMITS,
    agentId: "finance-analyst",
    name: "Finance Analyst",
    description: "财务分析：成本、售价、利润与盈亏平衡",
    role: "analysis",
    systemInstructions: "金额一律精确数值；所有结果必须显示计算假设与币种。",
    allowedTools: ["finance.calculate", "product.read"],
    permissionLevel: "L2",
  },
  {
    ...BASE_LIMITS,
    agentId: "learning-mentor",
    name: "Learning Mentor",
    description: "学习导师：学习计划、训练任务与能力评估",
    role: "learning",
    systemInstructions: "训练记录须关联项目成果，不得生成无依据的能力评分。",
    allowedTools: ["learning.read", "growth.read"],
    permissionLevel: "L2",
  },
];

export function getAgentDefinitions() {
  return AGENT_REGISTRY;
}

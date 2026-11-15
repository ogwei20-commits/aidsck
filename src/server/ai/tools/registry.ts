import type { PermissionLevel } from "@/types";

/**
 * 文档 5.4：Agent 只能通过受控工具白名单访问系统能力，不能自行增加权限。
 * 只有登记为 available 的工具可用，其余调用一律返回「未实现」，不静默放行。
 */
export interface ToolDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  implemented: boolean;
  sideEffect: "read" | "write" | "external";
}

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  { name: "project.read", description: "读取项目列表与详情", permissionLevel: "L1", implemented: true, sideEffect: "read" },
  { name: "task.create", description: "创建任务（写入数据库并记审计日志）", permissionLevel: "L2", implemented: true, sideEffect: "write" },
  { name: "project.create", description: "创建项目", permissionLevel: "L2", implemented: true, sideEffect: "write" },
  { name: "approval.request", description: "发起人工审批", permissionLevel: "L3", implemented: false, sideEffect: "write" },
  { name: "research.read", description: "读取研究资料", permissionLevel: "L1", implemented: false, sideEffect: "read" },
  { name: "finance.calculate", description: "利润与盈亏平衡计算", permissionLevel: "L2", implemented: false, sideEffect: "read" },
  { name: "knowledge.read", description: "知识检索", permissionLevel: "L1", implemented: false, sideEffect: "read" },
  { name: "external_call", description: "外部网络/付费服务调用（禁止 AI 自主执行）", permissionLevel: "L4", implemented: false, sideEffect: "external" },
];

export function isToolAllowed(name: string, level: PermissionLevel): boolean {
  if (level === "L4") return false;
  const tool = TOOL_REGISTRY.find((t) => t.name === name);
  if (!tool || !tool.implemented) return false;
  if (tool.sideEffect === "external") return false;
  const order: Record<PermissionLevel, number> = { L1: 1, L2: 2, L3: 3, L4: 0 };
  return order[level] >= order[tool.permissionLevel];
}

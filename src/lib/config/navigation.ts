import type { NavItem } from "@/types";

/**
 * 文档 1.1 / 1.2 / 7：全部模块统一登记。
 * 只有 ready / partial 会链接到真实页面；planned 一律显示「规划中」并标注 Sprint，
 * 避免用户误以为功能已可用。
 */
export const NAV_GROUPS = ["总览", "执行", "研究", "沉淀与治理"] as const;

export const NAV_ITEMS: readonly NavItem[] = [
  { slug: "dashboard", label: "综合首页", group: "总览", status: "ready", sprint: "S1", description: "工作台、导航与真实数据汇总" },
  { slug: "assistant", label: "AI 总管家", group: "总览", status: "planned", sprint: "S4", description: "对话、任务规划与 Agent 调度" },

  { slug: "projects", label: "项目中心", group: "执行", status: "partial", sprint: "S3", description: "项目创建、修改、进度（当前为最小版）" },
  { slug: "tasks", label: "任务中心", group: "执行", status: "partial", sprint: "S3", description: "任务创建与状态追踪（当前为最小版）" },
  { slug: "agents", label: "Agent 中心", group: "执行", status: "planned", sprint: "S4", description: "Agent 注册、分配与执行记录" },
  { slug: "workflows", label: "工作流中心", group: "执行", status: "planned", sprint: "S5", description: "可行性研究工作流执行引擎" },

  { slug: "market", label: "市场研究", group: "研究", status: "planned", sprint: "S5", description: "研究任务、资料、结论与来源" },
  { slug: "platforms", label: "平台比较", group: "研究", status: "planned", sprint: "S5", description: "平台档案与比较报告" },
  { slug: "products", label: "选品研究", group: "研究", status: "planned", sprint: "S5", description: "产品档案、竞品分析与评分" },
  { slug: "suppliers", label: "供应链研究", group: "研究", status: "planned", sprint: "S5", description: "供应商资料与物流研究" },
  { slug: "finance", label: "财务模拟", group: "研究", status: "planned", sprint: "S5", description: "成本、利润与盈亏平衡" },

  { slug: "learning", label: "学习中心", group: "沉淀与治理", status: "planned", sprint: "S6", description: "学习计划、课程与训练记录" },
  { slug: "growth", label: "成长档案", group: "沉淀与治理", status: "planned", sprint: "S6", description: "能力记录与项目成果" },
  { slug: "knowledge", label: "知识库", group: "沉淀与治理", status: "planned", sprint: "S5", description: "研究资料与知识检索" },
  { slug: "files", label: "文件中心", group: "沉淀与治理", status: "planned", sprint: "S3", description: "文件上传与元数据管理" },
  { slug: "reports", label: "报告中心", group: "沉淀与治理", status: "planned", sprint: "S5", description: "报告生成与导出" },
  { slug: "lineage", label: "数据溯源", group: "沉淀与治理", status: "planned", sprint: "S2", description: "数据来源、类型与可信度" },
  { slug: "approvals", label: "安全中心", group: "沉淀与治理", status: "partial", sprint: "S4", description: "权限检查、审批记录与操作日志（当前为最小版）" },
  { slug: "settings", label: "系统设置", group: "沉淀与治理", status: "planned", sprint: "S7", description: "环境与运行配置" },
];

export function findNavItem(slug: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => n.slug === slug);
}

export function navHref(slug: string): string {
  return slug === "dashboard" ? "/" : `/${slug}`;
}

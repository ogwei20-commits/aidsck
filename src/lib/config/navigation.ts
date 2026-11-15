import type { NavItem } from "@/types";

/**
 * 19 个模块的真实状态登记。
 *
 * 状态含义（不允许含糊）：
 * - ready   该模块有真实增删改查，数据落 PostgreSQL，刷新不丢
 * - partial 有真实数据，但能力不完整（例如工作流中心只能编辑流程定义，执行引擎尚未实现）
 *
 * 说明：文档 1.2 列的「规划中」能力（真实店铺管理、订单/库存同步、自动发布、
 * 广告投放、客服、自动退款采购、多租户、插件市场等）不属于这 19 个模块，
 * 它们在相关页面内以「第一阶段不实现」的形式明确标注，不在导航里伪装成入口。
 */
export const NAV_GROUPS = ["总览", "执行", "研究", "沉淀与治理"] as const;

export const NAV_ITEMS: readonly NavItem[] = [
  { slug: "dashboard", label: "综合首页", group: "总览", status: "ready", sprint: "对话 · 结果 · 沉淀", description: "今天的焦点、生意数字与执行轨迹" },
  { slug: "assistant", label: "AI 总管家", group: "总览", status: "ready", sprint: "规则模板拆解", description: "把一句目标拆成可执行任务" },

  { slug: "projects", label: "项目中心", group: "执行", status: "ready", sprint: "可增删改", description: "一次跨境尝试一个项目" },
  { slug: "tasks", label: "任务中心", group: "执行", status: "ready", sprint: "创建与执行", description: "每件事落到一条任务，可派 Agent 执行" },
  { slug: "agents", label: "Agent 中心", group: "执行", status: "ready", sprint: "注册与执行", description: "角色、工具白名单、权限等级，可直接派活" },
  { slug: "workflows", label: "工作流中心", group: "执行", status: "partial", sprint: "仅定义", description: "流程定义可编辑；执行引擎尚未实现" },

  { slug: "market", label: "市场研究", group: "研究", status: "ready", sprint: "问题到结论", description: "问题、资料、结论、来源" },
  { slug: "platforms", label: "平台比较", group: "研究", status: "ready", sprint: "佣金与门槛", description: "平台档案与适配评分" },
  { slug: "products", label: "选品研究", group: "研究", status: "ready", sprint: "进价与售价", description: "产品档案、需求与竞争强度" },
  { slug: "suppliers", label: "供应链研究", group: "研究", status: "ready", sprint: "起订与交期", description: "供应商报价、起订量、物流" },
  { slug: "finance", label: "财务模拟", group: "研究", status: "ready", sprint: "成本与利润", description: "单件成本、利润与盈亏平衡" },

  { slug: "learning", label: "学习中心", group: "沉淀与治理", status: "ready", sprint: "计划与进度", description: "学习计划与周投入" },
  { slug: "growth", label: "成长档案", group: "沉淀与治理", status: "ready", sprint: "能力与下一步", description: "能力等级与下一步动作" },
  { slug: "knowledge", label: "知识库", group: "沉淀与治理", status: "ready", sprint: "可检索条目", description: "结论、规则、踩过的坑" },
  { slug: "files", label: "文件中心", group: "沉淀与治理", status: "ready", sprint: "上传与下载", description: "原件上传、SHA-256 校验和与来源追溯" },
  { slug: "reports", label: "报告中心", group: "沉淀与治理", status: "ready", sprint: "草稿到定稿", description: "带来源的研究报告" },
  { slug: "lineage", label: "数据溯源", group: "沉淀与治理", status: "ready", sprint: "数据类型与留痕", description: "每条数据的来源与改动记录" },
  { slug: "approvals", label: "安全中心", group: "沉淀与治理", status: "ready", sprint: "审批与日志", description: "L3 操作的审批闸门" },
  { slug: "settings", label: "系统设置", group: "沉淀与治理", status: "ready", sprint: "运行参数", description: "集中管理运行配置" },
];

export function findNavItem(slug: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => n.slug === slug);
}

export function navHref(slug: string): string {
  return slug === "dashboard" ? "/" : `/${slug}`;
}

export function navByGroup(): { group: string; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV_ITEMS.filter((n) => n.group === group),
  }));
}

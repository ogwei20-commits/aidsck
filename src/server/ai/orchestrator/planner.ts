import { AGENT_REGISTRY } from "../agents/registry";

/**
 * 目标拆解器。
 *
 * 明确边界：这不是大模型推理，是一套内置的跨境电商研究流程模板。
 * 未接入模型时（默认配置），拆解结果必须标注「规则模板」，
 * 不能冒充 AI 输出——文档 12「不得将模拟 AI 标记为真实 AI」。
 */
export interface PlanStep {
  title: string;
  detail: string;
  agentSlug: string;
  agentName: string;
  permissionLevel: string;
  priority: number;
  /** 当前没有对应 Agent 的环节，需要人工执行 */
  manual: boolean;
}

interface Rule {
  match: RegExp;
  agentSlug: string;
  title: (target: string) => string;
  detail: string;
  priority: number;
  manual?: boolean;
}

const agentName = (slug: string) =>
  AGENT_REGISTRY.find((a) => a.agentId === slug)?.name ?? "人工执行";
const agentLevel = (slug: string) =>
  AGENT_REGISTRY.find((a) => a.agentId === slug)?.permissionLevel ?? "L1";

const RULES: Rule[] = [
  {
    match: /市场|需求|趋势|规模|增长|用户画像|消费/i,
    agentSlug: "market-analyst",
    title: () => "市场研究：规模、需求与竞争格局",
    detail: "确认目标市场的需求量、价格带与增长趋势；每条结论必须附来源链接并标注 R/E/P/S/U 数据类型。",
    priority: 1,
  },
  {
    match: /平台|亚马逊|amazon|tiktok|shopee|lazada|temu|独立站|佣金|入驻/i,
    agentSlug: "platform-analyst",
    title: () => "平台比较：佣金、门槛与品类适配度",
    detail: "至少对比 2 个平台的佣金结构、入驻要求、物流方案与品类限制，输出可复用的比较表。",
    priority: 1,
  },
  {
    match: /选品|品类|产品|竞品|爆款|蓝海|测品/i,
    agentSlug: "product-researcher",
    title: () => "选品研究：候选产品与竞品拆解",
    detail: "列出 3–5 个候选产品，逐个拆解头部竞品的定价、卖点、评价数量与差评集中点。",
    priority: 1,
  },
  {
    match: /供应链|供应商|工厂|采购|物流|海运|头程|尾程|起订/i,
    agentSlug: "supply-chain",
    title: () => "供应链研究：供应商报价、起订量与交期",
    detail: "找 3 家候选供应商，记录起订量、单价、交期与运费。当前无对应 Agent，需人工询价后录入。",
    priority: 2,
    manual: true,
  },
  {
    match: /成本|利润|售价|定价|毛利|盈亏|费率|广告费|roi/i,
    agentSlug: "finance-analyst",
    title: () => "财务模拟：单件成本、利润与盈亏平衡",
    detail: "按采购 + 头程 + 平台佣金 + 支付费率 + 广告逐项建方案，算出单件净利与盈亏平衡单量。",
    priority: 1,
  },
  {
    match: /合规|认证|fda|ce|税|vat|进口|清关|资质|许可/i,
    agentSlug: "compliance",
    title: () => "合规核查：准入资质与税务要求",
    detail: "确认目标市场对该品类的准入要求（注册、认证、标签、税号）。当前无对应 Agent，需人工核实后录入知识库。",
    priority: 2,
    manual: true,
  },
  {
    match: /学|学习|入门|了解|搞懂|训练|提升/i,
    agentSlug: "learning-mentor",
    title: () => "学习计划：补齐该方向的关键知识",
    detail: "把这次要搞懂的知识点拆成 4 周计划，每周可验证的产出，而不是列书单。",
    priority: 3,
  },
];

/** 没命中任何关键词时的默认流程：一条完整的可行性研究链 */
const FALLBACK: Rule[] = [
  RULES[0],
  RULES[1],
  RULES[2],
  RULES[4],
];

export interface PlanResult {
  steps: PlanStep[];
  /** 命中关键词，用于向用户解释为什么这样拆 */
  matched: string[];
  mode: "rule-template";
  note: string;
}

export function planTarget(target: string): PlanResult {
  const text = target.trim();
  const hits = RULES.filter((r) => r.match.test(text));
  const base = hits.length > 0 ? hits : FALLBACK;

  // 只问一件事时，补齐可行性链上缺失的必要环节——总管家不能只回答被问到的部分
  const chosen = [...base];
  if (chosen.length < 4) {
    for (const fallback of FALLBACK) {
      if (chosen.length >= 4) break;
      if (!chosen.some((c) => c.agentSlug === fallback.agentSlug)) chosen.push(fallback);
    }
  }

  // 同一 Agent 只出一个步骤，避免重复建任务
  const seen = new Set<string>();
  const steps: PlanStep[] = [];
  for (const rule of chosen) {
    if (seen.has(rule.agentSlug)) continue;
    seen.add(rule.agentSlug);
    steps.push({
      title: rule.title(text),
      detail: rule.detail,
      agentSlug: rule.agentSlug,
      agentName: agentName(rule.agentSlug),
      permissionLevel: agentLevel(rule.agentSlug),
      priority: rule.priority,
      manual: rule.manual ?? !AGENT_REGISTRY.some((a) => a.agentId === rule.agentSlug),
    });
  }

  steps.sort((a, b) => a.priority - b.priority);

  const added = steps.length - hits.length;

  return {
    steps,
    matched: hits.map((r) => r.agentSlug),
    mode: "rule-template",
    note:
      hits.length > 0
        ? `匹配到你提到的 ${hits.length} 个环节${added > 0 ? `，并补齐了可行性链上另外 ${added} 个必要步骤` : ""}。这是内置流程模板的匹配结果，不是模型推理。`
        : "没有识别到具体环节，按「市场 → 平台 → 选品 → 财务」的完整可行性链拆解。这是内置流程模板，不是模型推理。",
  };
}

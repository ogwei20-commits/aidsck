/**
 * 无模型模式下的 Agent 真实产出物：研究框架。
 *
 * 设计约束（对应文档 5.5 与「禁止伪造」）：
 * 1. 框架只回答「要查什么、需要什么证据、怎么算合格」，绝不产出任何研究结论或数字。
 * 2. 每条问题必须绑定证据类型（R/E/P/S/U），让调用方知道下一步该找什么材料。
 * 3. 输出带 hasConclusion: false 标记，UI 与下游必须据此显示「这是框架，不是结论」。
 *
 * 为什么这不是「假 AI」：框架是确定性知识（行业通行的研究步骤），
 * 与「模型推理」是两回事，因此可以如实标注来源为 rule-template。
 */

export interface FrameworkQuestion {
  /** 要回答的问题 */
  q: string;
  /** 需要什么证据才能回答 */
  evidence: string;
  /** 该证据的推荐数据类型 */
  dataType: "R" | "E" | "P" | "S" | "U";
}

export interface AgentFramework {
  /** 产出物名称 */
  deliverable: string;
  /** 研究/执行步骤 */
  questions: FrameworkQuestion[];
  /** 验收标准：满足这些才算这一步做完 */
  acceptance: string[];
  /** 该环节最容易踩的坑 */
  pitfalls: string[];
}

const FRAMEWORKS: Record<string, AgentFramework> = {
  supervisor: {
    deliverable: "任务分解与分工表",
    questions: [
      {
        q: "这个目标能不能拆成「市场 → 平台 → 选品 → 财务」四个可独立验收的环节？",
        evidence: "目标原文 + 已有项目资料",
        dataType: "U",
      },
      {
        q: "每个环节由哪个 Agent 负责、交付物是什么、验收标准是什么？",
        evidence: "本系统 Agent 注册表与各自职责",
        dataType: "R",
      },
      {
        q: "哪些环节涉及外部操作（发布、投放、付款），需要人工审批？",
        evidence: "文档 9.1 权限分级",
        dataType: "R",
      },
    ],
    acceptance: [
      "每个子任务都有唯一负责人与可核对的交付物",
      "涉及 L3 的动作全部标注为「需审批」",
      "没有把两个环节合并成一个模糊任务",
    ],
    pitfalls: [
      "把「研究一下」当成任务——没有交付物就无法验收",
      "漏掉财务验证，导致选品结论无法落地",
    ],
  },

  "market-analyst": {
    deliverable: "市场研究简报（含量级、人群、季节性、竞争强度）",
    questions: [
      {
        q: "目标品类在目标市场的年销售额与近三年增速是多少？",
        evidence: "平台官方行业报告，或第三方数据工具的类目报告导出",
        dataType: "R",
      },
      {
        q: "目标人群是谁：年龄、收入区间、购买动机、复购频次？",
        evidence: "平台消费者洞察报告 / 问卷 / 评论语义归纳",
        dataType: "E",
      },
      {
        q: "旺淡季如何分布？备货节奏该怎么排？",
        evidence: "平台近 24 个月搜索趋势或销量趋势",
        dataType: "R",
      },
      {
        q: "竞争强度如何：类目 Top100 的销量集中度、平均评分、价格带分布？",
        evidence: "类目榜单抓取结果（须记录采集日期）",
        dataType: "R",
      },
    ],
    acceptance: [
      "每个结论都附来源与采集日期，缺来源的结论一律标 E 或 U",
      "市场规模给出区间而非单一数字，并写明测算口径",
      "季节性结论至少覆盖 12 个月数据",
    ],
    pitfalls: [
      "拿全球市场规模替代目标国市场",
      "用「增长很快」这种无法证伪的描述代替增速数字",
      "忽略退货率对真实需求的高估影响",
    ],
  },

  "platform-analyst": {
    deliverable: "平台比较报告（费用结构、准入、规则风险）",
    questions: [
      {
        q: "各候选平台的费率结构是什么：佣金、支付费、仓储费、月租？",
        evidence: "平台官方费率页（须记录抓取日期，费率会变）",
        dataType: "R",
      },
      {
        q: "入驻门槛：需要哪些资质、审核周期多长、是否要本地公司？",
        evidence: "平台官方招商页或招商经理口径",
        dataType: "R",
      },
      {
        q: "该品类的合规要求：认证、标签、限售、侵权风险？",
        evidence: "平台品类规则页 + 目标国监管机构公告",
        dataType: "R",
      },
      {
        q: "同一商品在各平台的到手价与毛利差异有多大？",
        evidence: "按统一成本口径套算各平台费率",
        dataType: "E",
      },
    ],
    acceptance: [
      "费率表注明抓取日期，并说明是否含税",
      "合规风险逐条对应到具体规则条款，不写「需注意合规」这种空话",
      "比较结论给出「什么情况下选 A、什么情况下选 B」",
    ],
    pitfalls: [
      "只比佣金不比仓储与退货处理费",
      "忽略平台规则变更历史，导致按旧规则测算",
    ],
  },

  "product-researcher": {
    deliverable: "产品与竞品档案（含评分与权重说明）",
    questions: [
      {
        q: "候选品的采购成本区间、起订量、打样周期是多少？",
        evidence: "供应商报价单（须注明是否含税、是否含包装）",
        dataType: "R",
      },
      {
        q: "Top 5 竞品的售价、评分、评论数、上架时间、主要差评点是什么？",
        evidence: "平台商品页抓取（记录 ASIN/商品 ID 与采集日期）",
        dataType: "R",
      },
      {
        q: "差评集中在哪些问题上？这些问题能否通过改款解决？",
        evidence: "竞品 1-3 星评论的语义归类",
        dataType: "E",
      },
      {
        q: "该品是否存在专利、商标或外观侵权风险？",
        evidence: "目标国商标/专利检索结果",
        dataType: "R",
      },
    ],
    acceptance: [
      "评分必须公开权重与打分依据，不允许只给一个总分",
      "每个竞品都有可回溯的商品 ID",
      "侵权风险给出「已检索 / 未检索」的明确状态，不能留空",
    ],
    pitfalls: [
      "只看销量不看评论增速，误判生命周期阶段",
      "用供应商自述的「爆款」代替真实销量数据",
    ],
  },

  "finance-analyst": {
    deliverable: "成本结构与盈亏平衡测算",
    questions: [
      {
        q: "单件总成本由哪几项构成，各是多少？",
        evidence: "采购报价 + 物流报价 + 平台费率表",
        dataType: "R",
      },
      {
        q: "在目标售价下，单件净利与毛利率是多少？",
        evidence: "按单件总成本与售价套算（口径须可复现）",
        dataType: "E",
      },
      {
        q: "固定投入有多少（商标、检测、首批库存、工具订阅）？",
        evidence: "实际报价或账单",
        dataType: "R",
      },
      {
        q: "要卖多少件才能覆盖固定投入？退货率上调后有何变化？",
        evidence: "盈亏平衡测算 + 敏感性分析",
        dataType: "P",
      },
    ],
    acceptance: [
      "金额一律用精确数值，不出现浮点误差",
      "每个结果都显示币种与计算假设",
      "给出至少三档售价的对比，而不是单一方案",
    ],
    pitfalls: [
      "把单件费用当成固定投入算盈亏平衡（口径错误）",
      "漏算退货处理费与仓储长期费",
      "用毛利率代替净利率下结论",
    ],
  },

  "learning-mentor": {
    deliverable: "学习计划与训练任务",
    questions: [
      {
        q: "这个项目当前最卡的能力缺口是什么？",
        evidence: "项目执行记录与任务阻塞原因",
        dataType: "U",
      },
      {
        q: "补齐这个缺口需要学什么，先后顺序是什么？",
        evidence: "能力项拆解（如：合规申报 → 税务 → 平台规则）",
        dataType: "R",
      },
      {
        q: "怎么验证学会了：产出物是什么？",
        evidence: "可交付的训练成果（如：一份合规自查表）",
        dataType: "U",
      },
    ],
    acceptance: [
      "每个学习项都绑定一个可交付的训练成果",
      "计划按周拆分，每周投入时长明确",
      "评估标准不依赖主观感受",
    ],
    pitfalls: [
      "列一堆课程但没有训练任务",
      "计划脱离当前项目，学完用不上",
    ],
  },
};

const FALLBACK: AgentFramework = {
  deliverable: "通用研究框架",
  questions: [
    { q: "要回答的核心问题是什么？", evidence: "目标原文与已有资料", dataType: "U" },
    { q: "需要哪些可核验的证据？", evidence: "官方文档、平台数据或供应商报价", dataType: "R" },
    { q: "怎么判断这一步做完了？", evidence: "可交付物与验收标准", dataType: "U" },
  ],
  acceptance: ["每个结论都能追溯到来源", "验收标准可被第三方复核"],
  pitfalls: ["把假设当成结论", "交付物无法验证"],
};

export function getFramework(agentSlug: string): AgentFramework {
  return FRAMEWORKS[agentSlug] ?? FALLBACK;
}

/** 把框架渲染成可读文本（写入 agent_messages，也可直接展示） */
export function renderFramework(agentName: string, fw: AgentFramework): string {
  const lines: string[] = [
    `【${agentName} · 研究框架】`,
    "",
    `产出物：${fw.deliverable}`,
    "",
    "需要回答的问题：",
    ...fw.questions.map(
      (q, i) => `${i + 1}. ${q.q}\n   所需证据：${q.evidence}\n   期望数据类型：${q.dataType}`,
    ),
    "",
    "验收标准：",
    ...fw.acceptance.map((a) => `- ${a}`),
    "",
    "常见坑：",
    ...fw.pitfalls.map((p) => `- ${p}`),
  ];
  return lines.join("\n");
}

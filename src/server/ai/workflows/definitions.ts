import type { WorkflowDefinition, WorkflowStep } from "./types";

/**
 * 内置工作流定义（随代码发布，seed 时写入 workflows 表）。
 *
 * 与文档第 8 节「跨境电商创业可行性研究」的 15 个节点一一对应。
 * 两个节点的处理方式是刻意如实的：
 * - 节点 8（供应链与合规研究）：第二阶段才做，标 deferred 而不是假装跑过。
 * - 节点 15（更新成长档案）：S6 才做，同样标 deferred。
 * 其余节点都真实执行——Agent 节点会真的建任务、真的调执行引擎、真的写库。
 */

const feasibilitySteps: WorkflowStep[] = [
  {
    id: "s1",
    title: "创建研究项目",
    kind: "start",
    description: "为目标建一个项目载体。后续每个节点产出都挂在这个项目下，便于回溯。",
    acceptance: "projects 表出现一条本项目记录，状态 active",
  },
  {
    id: "s2",
    title: "收集用户目标",
    kind: "manual",
    description: "把「我要做什么、投多少钱、多久见效」写成一句可验收的目标。",
    inputHint: "例如：3 个月内用 2 万元启动资金验证家居类目在亚马逊美国站的可行性",
    acceptance: "目标里包含品类、平台、预算、时间四项中的至少三项",
  },
  {
    id: "s3",
    title: "生成研究任务",
    kind: "agent",
    agentSlug: "supervisor",
    taskTitle: "拆解研究任务并分工",
    description: "把目标拆成市场、平台、选品、财务四个可独立验收的环节，指定负责人与交付物。",
    acceptance: "每个子任务都有唯一负责人、交付物与验收标准",
  },
  {
    id: "s4",
    title: "Market Analyst 执行",
    kind: "agent",
    agentSlug: "market-analyst",
    taskTitle: "市场研究：规模、趋势与证据",
    description: "研究目标品类的市场规模、增长趋势、季节性，并标注每条数据的来源与类型。",
    acceptance: "结论均关联来源；区分真实数据（R/E）与估算（P/S）",
  },
  {
    id: "s5",
    title: "Platform Analyst 执行",
    kind: "agent",
    agentSlug: "platform-analyst",
    taskTitle: "平台比较：费用、规则与门槛",
    description: "比较候选平台的入驻门槛、佣金、物流与合规要求，给出可落地的比较结论。",
    acceptance: "平台费用标注采集时间；政策类结论标注生效日期",
  },
  {
    id: "s6",
    title: "Product Researcher 执行",
    kind: "agent",
    agentSlug: "product-researcher",
    taskTitle: "选品研究：竞品与评分",
    description: "列出候选品，做竞品拆解与评分，说明权重与假设。",
    acceptance: "评分说明权重；竞品数据关联来源",
  },
  {
    id: "s7",
    title: "Finance Analyst 执行",
    kind: "agent",
    agentSlug: "finance-analyst",
    taskTitle: "财务测算：成本、利润与盈亏平衡",
    description: "按单件成本、佣金、支付费率、固定投入算净利与盈亏平衡销量。",
    acceptance: "金额精确到分；标明币种与全部假设；固定投入为 0 时明确说明无法计算",
  },
  {
    id: "s8",
    title: "供应链与合规研究",
    kind: "deferred",
    description: "供应商筛选、物流方案、认证与税务合规。",
    reason: "该节点属于第二阶段范围（文档 8 标注 Phase 2）。本阶段只登记，不执行，避免给出没有依据的合规结论。",
  },
  {
    id: "s9",
    title: "汇总研究发现",
    kind: "summary",
    description: "把前四个环节的产出按固定结构拼成一份汇总，不做新的推断。",
    acceptance: "汇总里每一段都能追溯到具体节点产出",
  },
  {
    id: "s10",
    title: "检查证据与数据类型",
    kind: "check",
    checks: ["coverage", "evidence", "no-fake-conclusion"],
    description: "按清单核对：每段是否有产出、是否标注数据类型、框架模式是否被误当成结论。",
    acceptance: "问题清单为空，或问题已被人工明确接受",
  },
  {
    id: "s11",
    title: "交叉审核关键结论",
    kind: "check",
    checks: ["traceability"],
    description: "按审核清单逐条核对关键结论是否具备来源、时间与适用范围。规则核对，不等同独立模型复核。",
    acceptance: "关键结论全部可追溯；无来源的结论被标为待验证",
  },
  {
    id: "s12",
    title: "生成研究报告",
    kind: "report",
    description: "把汇总与审核结果写成报告，正文落 reports 表，可后续导出。",
    acceptance: "reports 表出现一条本项目报告，正文含汇总与审核结论",
  },
  {
    id: "s13",
    title: "用户审核（人工闸门）",
    kind: "gate",
    description: "报告必须由本人确认后才能算完成。通过后本次所有节点任务一并标记完成。",
    acceptance: "审批记录写入 audit_logs，决策人可追溯",
  },
  {
    id: "s14",
    title: "保存知识",
    kind: "archive",
    description: "把报告正文存入知识库，打上项目与工作流标签。",
    acceptance: "knowledge_items 出现一条可检索记录",
  },
  {
    id: "s15",
    title: "更新成长档案",
    kind: "deferred",
    description: "根据本次研究评估能力变化，更新成长档案。",
    reason: "该节点属于 S6 范围（文档 10 路线图）。能力评分必须有依据，本阶段不生成无依据的评分。",
  },
];

const selectionSteps: WorkflowStep[] = [
  {
    id: "s1",
    title: "建立选品项目",
    kind: "start",
    description: "为这次选品建一个项目，后续所有数据都挂在它下面。",
    acceptance: "projects 表出现本项目记录",
  },
  {
    id: "s2",
    title: "写下候选品与判断标准",
    kind: "manual",
    description: "列出 1–3 个候选品，写清你最在意什么（利润、竞争、物流难度）。",
    inputHint: "例如：候选 A/B/C；最在意单件净利 ≥ 40 元且头程可空运",
    acceptance: "有候选品清单，且至少一条判断标准可量化",
  },
  {
    id: "s3",
    title: "竞品与需求核对",
    kind: "agent",
    agentSlug: "product-researcher",
    taskTitle: "选品验证：竞品与需求核对",
    description: "对候选品做竞品拆解，核对需求真实性与竞争强度。",
    acceptance: "每个候选品都有竞品样本与需求证据",
  },
  {
    id: "s4",
    title: "单件经济性测算",
    kind: "agent",
    agentSlug: "finance-analyst",
    taskTitle: "选品验证：单件经济性测算",
    description: "算清单件总成本、净利与盈亏平衡销量。",
    acceptance: "假设齐全，金额精确到分",
  },
  {
    id: "s5",
    title: "选品结论审核（人工闸门）",
    kind: "gate",
    description: "你自己拍板是否进入下一步采购或测款。",
    acceptance: "审批记录写入 audit_logs",
  },
  {
    id: "s6",
    title: "沉淀到知识库",
    kind: "archive",
    description: "把结论与关键数据存入知识库，下次选品可直接复用。",
    acceptance: "knowledge_items 出现一条记录",
  },
];

const weeklySteps: WorkflowStep[] = [
  {
    id: "s1",
    title: "建立复盘项目",
    kind: "start",
    description: "为本周复盘建项目，便于按周追溯。",
    acceptance: "projects 表出现本项目记录",
  },
  {
    id: "s2",
    title: "写下本周事实",
    kind: "manual",
    description: "只写发生了什么（上架数、出单数、花费），不写评价。",
    inputHint: "例如：上架 3 个 SKU，出单 12 笔，广告花费 380 元",
    acceptance: "至少有 3 条可核对的事实",
  },
  {
    id: "s3",
    title: "找偏差",
    kind: "agent",
    agentSlug: "supervisor",
    taskTitle: "周度复盘：目标与实际偏差分析",
    description: "对照本周目标与实际，找出偏差最大的两处并给出可能原因。",
    acceptance: "每条偏差都能对应到具体事实",
  },
  {
    id: "s4",
    title: "确定下周动作（人工闸门）",
    kind: "gate",
    description: "你自己决定下周做哪两件事，系统只记录不复盘你。",
    acceptance: "审批记录写入 audit_logs",
  },
];

export interface BuiltinWorkflow {
  slug: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
}

export const BUILTIN_WORKFLOWS: BuiltinWorkflow[] = [
  {
    slug: "product-feasibility",
    name: "跨境电商创业可行性研究",
    description:
      "文档第 8 节的完整链路：目标 → 四个分析环节 → 汇总 → 证据核对 → 报告 → 人工审核 → 归档。15 个节点，其中 2 个本阶段不执行。",
    definition: {
      version: 1,
      deliverable: "一份可审阅的可行性研究报告 + 落库的成本与结论",
      steps: feasibilitySteps,
    },
  },
  {
    slug: "product-selection",
    name: "选品验证",
    description: "短链路：候选品 → 竞品核对 → 单件测算 → 你拍板 → 归档。适合每周跑一次。",
    definition: {
      version: 1,
      deliverable: "选品结论 + 单件经济性测算结果",
      steps: selectionSteps,
    },
  },
  {
    slug: "weekly-review",
    name: "周度复盘",
    description: "三段式：本周事实 → 偏差分析 → 下周动作。不生成评价，只对齐事实与动作。",
    definition: {
      version: 1,
      deliverable: "本周偏差清单 + 下周两个动作",
      steps: weeklySteps,
    },
  },
];

export function findBuiltin(slug: string): BuiltinWorkflow | undefined {
  return BUILTIN_WORKFLOWS.find((w) => w.slug === slug);
}

/**
 * 定义解析：数据库里存的是 jsonb，读出来必须先校验再执行。
 * 任何结构不对的定义都直接拒绝，避免执行到一半才发现缺字段。
 */
export function parseDefinition(raw: unknown): WorkflowDefinition {
  if (!raw || typeof raw !== "object") throw new Error("工作流定义为空");
  const def = raw as Partial<WorkflowDefinition>;
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error("工作流定义缺少 steps");
  }
  const seen = new Set<string>();
  const steps = def.steps.map((step, index) => {
    if (!step || typeof step !== "object") throw new Error(`第 ${index + 1} 个节点格式错误`);
    const s = step as Partial<WorkflowStep>;
    if (!s.id || !/^[a-z0-9-]{1,40}$/.test(s.id)) {
      throw new Error(`第 ${index + 1} 个节点 id 非法`);
    }
    if (seen.has(s.id)) throw new Error(`节点 id 重复：${s.id}`);
    seen.add(s.id);
    if (!s.title) throw new Error(`节点 ${s.id} 缺少标题`);
    if (!s.kind) throw new Error(`节点 ${s.id} 缺少类型`);
    if (s.kind === "agent" && !s.agentSlug) {
      throw new Error(`节点 ${s.id} 是 agent 类型但未指定 agentSlug`);
    }
    if (s.kind === "deferred" && !s.reason) {
      throw new Error(`节点 ${s.id} 标为不执行但没写原因`);
    }
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      description: s.description ?? "",
      agentSlug: s.agentSlug,
      taskTitle: s.taskTitle,
      acceptance: s.acceptance,
      reason: s.reason,
      inputHint: s.inputHint,
      checks: s.checks,
    } satisfies WorkflowStep;
  });

  return {
    version: typeof def.version === "number" ? def.version : 1,
    deliverable: def.deliverable ?? "",
    steps,
  };
}

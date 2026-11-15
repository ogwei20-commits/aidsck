/**
 * 工作流执行引擎的类型定义。
 *
 * 设计取舍（对应文档 8「先实现可配置的基础工作流执行引擎，不做可视化流程设计器」）：
 * - 流程定义是数据，不是代码：一份 JSON 存在 workflows.definition，改流程不用改代码。
 * - 节点只做「有把握真做」的事：能自动的自动，做不了的如实标 skipped，不假装跑过。
 * - 人工闸门是节点类型，不是 UI 上的一个按钮——审核不可跳过必须落在状态机里。
 */

/** 节点类型：决定这一步由谁执行、产出落在哪 */
export type StepKind =
  /** 准备项目载体：没有项目就建一个，后续产出都挂在它下面 */
  | "start"
  /** 必须由人提供内容（例如研究目标）；启动时已提供则自动通过 */
  | "manual"
  /** 交给某个 Agent 执行，产出写 agent_runs / agent_messages */
  | "agent"
  /** 把前序产出拼成汇总文本，不调用模型、不产生新结论 */
  | "summary"
  /** 规则核对：按清单检查证据与数据类型，输出问题列表 */
  | "check"
  /** 生成报告并写入 reports 表，供后续导出 */
  | "report"
  /** 人工闸门：必须有人明确批准，否则流程不前进 */
  | "gate"
  /** 落库归档（例如保存到知识库） */
  | "archive"
  /** 本阶段不实现的节点：显式标 skipped 并写明原因，绝不假装完成 */
  | "deferred";

export interface WorkflowStep {
  id: string;
  title: string;
  kind: StepKind;
  /** 人话说明：这一步到底做什么、交付什么 */
  description: string;
  /** agent 节点：使用哪个 Agent（对应 agents.slug） */
  agentSlug?: string;
  /** agent 节点：任务标题前缀，缺省用节点标题 */
  taskTitle?: string;
  /** 验收要求：满足什么才算这一步合格 */
  acceptance?: string;
  /** deferred 节点：为什么本阶段不做 */
  reason?: string;
  /** manual 节点：期望人补充的内容说明 */
  inputHint?: string;
  /** check 节点：要跑哪几组核对规则，缺省跑全部 */
  checks?: CheckKind[];
}

/** 核对规则：每条都能给出可复现的判断依据，不是主观打分 */
export type CheckKind =
  /** 每个该有产出的节点是否真的有产出 */
  | "coverage"
  /** 产出里是否标注了数据类型（R/E/P/S/U） */
  | "evidence"
  /** 关键结论是否可追溯到来源或前序节点 */
  | "traceability"
  /** 框架模式产出是否被误标成结论 */
  | "no-fake-conclusion";

export interface WorkflowDefinition {
  version: number;
  steps: WorkflowStep[];
  /** 这条流程整体交付什么 */
  deliverable: string;
}

export type StepStatus =
  | "pending"
  | "running"
  | "succeeded"
  /** 等人处理：闸门待批准、人工节点待填写、核对发现问题待确认 */
  | "waiting"
  | "failed"
  | "skipped";

export interface StepState {
  status: StepStatus;
  output?: string;
  /** agent 节点关联的任务与执行记录，便于追溯 */
  taskId?: string;
  runId?: string;
  mode?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  issues?: string[];
  decision?: "approve" | "reject";
  note?: string;
  reason?: string;
  /** report / archive 节点落库后的记录 ID */
  recordId?: string;
}

export interface WorkflowLogEntry {
  at: string;
  stepId: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface WorkflowContext {
  /** 研究目标：manual 节点「收集用户目标」的输入，也是 project 命名的依据 */
  goal: string;
  /** 启动时按节点 id 提供的补充输入（人工节点的内容） */
  inputs?: Record<string, string>;
  projectId?: string;
  steps: Record<string, StepState>;
  log: WorkflowLogEntry[];
  /** 生成报告后的 Markdown 正文，供归档与导出复用 */
  reportBody?: string;
  reportId?: string;
}

/** 推进结果：告诉调用方停在哪、为什么停 */
export interface AdvanceResult {
  runId: string;
  workflowSlug: string;
  workflowName: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  currentNode: string | null;
  currentNodeTitle: string | null;
  /** 本次推进实际执行了哪几步 */
  executed: { stepId: string; title: string; status: StepStatus }[];
  needsHuman: boolean;
  /** 需要人做什么（needsHuman 时必有） */
  humanAction: string | null;
  context: WorkflowContext;
  definition: WorkflowDefinition;
  disclaimer: string;
}

export const NO_MODEL_DISCLAIMER =
  "当前未接入任何 AI 模型（AI_PROVIDER=none）。流程中的 Agent 节点产出为内置研究框架，不含研究结论，不产生费用；框架是真执行，但不是模型推理。";

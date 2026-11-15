import type { CheckKind, WorkflowContext, WorkflowDefinition, WorkflowStep } from "./types";

/**
 * 汇总、报告与核对规则的纯函数部分。
 * 单独抽出来有两个好处：可以单测、不依赖数据库；
 * 以及避免「汇总」这一步悄悄调用模型——这里没有任何网络调用。
 */

const CLIP = 2400;

function clip(text: string, max = CLIP): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}\n…（此处截断，完整内容见对应任务的执行记录）`;
}

export interface SummarySection {
  step: WorkflowStep;
  output: string;
}

export function collectAgentOutputs(
  def: WorkflowDefinition,
  ctx: WorkflowContext,
): SummarySection[] {
  return def.steps
    .filter((s) => s.kind === "agent")
    .map((step) => ({ step, output: ctx.steps[step.id]?.output ?? "" }))
    .filter((s) => s.output.trim().length > 0);
}

/** 节点 9：把前序产出按固定结构拼起来，不做任何新的推断 */
export function buildSummary(
  def: WorkflowDefinition,
  ctx: WorkflowContext,
  workflowName: string,
): string {
  const sections = collectAgentOutputs(def, ctx);
  const lines: string[] = [
    `【${workflowName} · 汇总】`,
    "",
    `研究目标：${ctx.goal || "（未填写）"}`,
    "",
    "以下是各环节产出的原文拼接，不含新的分析或结论。",
    "",
  ];

  if (sections.length === 0) {
    lines.push("（前序环节没有产生可用产出，汇总为空。）");
  }

  for (const { step, output } of sections) {
    lines.push(`## ${step.title}`, "", clip(output), "");
  }

  const skipped = def.steps.filter((s) => ctx.steps[s.id]?.status === "skipped");
  if (skipped.length > 0) {
    lines.push("## 本次未执行的节点", "");
    for (const s of skipped) {
      lines.push(`- ${s.title}：${ctx.steps[s.id]?.reason ?? "本阶段不执行"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** 节点 12：报告正文。明确写出「结论状态」，避免把框架当成研究结论 */
export function buildReport(input: {
  workflowName: string;
  goal: string;
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  projectId?: string;
  generatedAt: Date;
}): { title: string; summary: string; body: string } {
  const { workflowName, goal, def, ctx, projectId, generatedAt } = input;
  const sections = collectAgentOutputs(def, ctx);
  const checkSteps = def.steps.filter((s) => s.kind === "check");

  const title = `${goal ? goal.slice(0, 60) : workflowName} · 研究报告`;
  const summary = sections.length
    ? `${sections.length} 个环节产出已汇编；核对节点 ${checkSteps.length} 个；结论待人工确认。`
    : "本次没有产生可汇编的环节产出。";

  const lines: string[] = [
    `# ${title}`,
    "",
    `- 生成时间：${generatedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    `- 工作流：${workflowName}（v${def.version}）`,
    `- 项目：${projectId ?? "未关联"}`,
    `- 交付物：${def.deliverable || "见下方各节"}`,
    "",
    "> 说明：本报告由工作流按节点顺序汇编，正文来自各 Agent 节点的执行记录。",
    "> 在没有接入模型的情况下，Agent 节点的产出是研究框架（要查什么、需要什么证据），",
    "> 不是研究结论。凡未标注来源的段落都不得作为决策依据。",
    "",
    "## 一、研究目标",
    "",
    goal || "（未填写）",
    "",
    "## 二、各环节产出",
    "",
  ];

  if (sections.length === 0) {
    lines.push("（无）", "");
  } else {
    sections.forEach(({ step, output }, i) => {
      lines.push(`### 2.${i + 1} ${step.title}`, "", clip(output), "");
    });
  }

  lines.push("## 三、证据与核对", "");
  const audit = checkSteps.map((s) => ({ step: s, state: ctx.steps[s.id] }));
  if (audit.length === 0) {
    lines.push("（本次流程未设置核对节点）", "");
  } else {
    for (const { step, state } of audit) {
      const issues = state?.issues ?? [];
      lines.push(
        `- ${step.title}：${issues.length === 0 ? "未发现问题" : `${issues.length} 条待处理`}`,
      );
      for (const issue of issues) lines.push(`  - ${issue}`);
      if (state?.decision === "approve" && state.note) {
        lines.push(`  - 人工备注：${state.note}`);
      }
    }
    lines.push("");
  }

  lines.push(
    "## 四、结论状态",
    "",
    "**尚无经人工确认的研究结论。**",
    "",
    "本报告的作用是把「已经跑了什么、产出是什么、还缺什么证据」摊开，",
    "让审核人能在一次阅读里判断下一步该补哪块。是否采纳，由人工审核节点决定。",
    "",
  );

  return { title, summary, body: lines.join("\n") };
}

export interface CheckResult {
  /** 阻断项：不解决就不该继续 */
  blocking: string[];
  /** 提示项：可以继续，但报告里必须显示 */
  advisory: string[];
}

const EVIDENCE_RE = /数据类型[：:]\s*[REPSU]|[（(]\s*[REPSU]\s*[)）]/;
const SOURCE_RE = /来源|依据|证据|参考|出处/;
const FAKE_CONCLUSION_RE = /结论[：:]\s*\S/;

/** 节点 10/11：按清单核对，每条判断都能复现 */
export function runChecks(
  def: WorkflowDefinition,
  ctx: WorkflowContext,
  checks: CheckKind[],
): CheckResult {
  const blocking: string[] = [];
  const advisory: string[] = [];
  const frameworkSteps: string[] = [];
  const agents = def.steps.filter((s) => s.kind === "agent");

  for (const step of agents) {
    const state = ctx.steps[step.id];
    const output = state?.output ?? "";

    if (checks.includes("coverage")) {
      if (state?.status !== "succeeded" || output.trim().length === 0) {
        blocking.push(`「${step.title}」没有可用产出，无法进入下一步`);
        continue;
      }
    }
    if (!output) continue;

    if (checks.includes("evidence") && !EVIDENCE_RE.test(output)) {
      blocking.push(`「${step.title}」产出未标注数据类型（R/E/P/S/U）`);
    }

    if (checks.includes("traceability") && !SOURCE_RE.test(output)) {
      advisory.push(`「${step.title}」产出缺少来源或依据说明，相关表述不能作为决策依据`);
    }

    if (checks.includes("no-fake-conclusion") && state?.mode === "framework" && FAKE_CONCLUSION_RE.test(output)) {
      blocking.push(`「${step.title}」是框架产出却出现「结论：」字样，可能被误当成真实结论`);
    }

    // 框架提示只在做「证据」类核对时给：追溯性核对（节点 11）不重复同一条
    const caresAboutEvidence = checks.includes("evidence") || checks.includes("no-fake-conclusion");
    if (state?.mode === "framework" && caresAboutEvidence) frameworkSteps.push(step.title);
  }

  // 五个环节都是框架产出时合并成一条，避免同一句提示重复五遍占满页面
  if (frameworkSteps.length === 1) {
    advisory.push(`「${frameworkSteps[0]}」为框架产出，尚无实测数据；需按框架采集后再核验`);
  } else if (frameworkSteps.length > 1) {
    advisory.push(
      `${frameworkSteps.length} 个环节均为框架产出（${frameworkSteps.join("、")}），尚无实测数据；需按框架采集后再核验`,
    );
  }

  return { blocking, advisory };
}

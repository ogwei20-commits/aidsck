"use client";

import Link from "next/link";
import { useState } from "react";

/** 与 server 端 AdvanceResult 结构一致的客户端副本（避免把服务端模块打进浏览器包） */
type StepStatus = "pending" | "running" | "succeeded" | "waiting" | "failed" | "skipped";
type StepKind = "start" | "manual" | "agent" | "summary" | "check" | "report" | "gate" | "archive" | "deferred";

interface StepState {
  status: StepStatus;
  output?: string;
  taskId?: string;
  runId?: string;
  mode?: string;
  issues?: string[];
  decision?: "approve" | "reject";
  note?: string;
  reason?: string;
  recordId?: string;
  durationMs?: number;
}

interface Definition {
  version: number;
  deliverable: string;
  steps: {
    id: string;
    title: string;
    kind: StepKind;
    description: string;
    agentSlug?: string;
    acceptance?: string;
    reason?: string;
    inputHint?: string;
  }[];
}

interface RunResult {
  runId: string;
  workflowSlug: string;
  workflowName: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  currentNode: string | null;
  currentNodeTitle: string | null;
  executed: { stepId: string; title: string; status: StepStatus }[];
  needsHuman: boolean;
  humanAction: string | null;
  context: { goal: string; projectId?: string; steps: Record<string, StepState>; reportId?: string };
  definition: Definition;
  disclaimer: string;
}

interface WfSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  stepCount: number;
  definitionValid: boolean;
  definition: Definition | null;
  lastRun: { id: string; status: string } | null;
}

const KIND_LABEL: Record<StepKind, string> = {
  start: "准备",
  manual: "人工填写",
  agent: "Agent 执行",
  summary: "汇总",
  check: "核对",
  report: "报告",
  gate: "人工审核",
  archive: "归档",
  deferred: "本阶段跳过",
};

const STATE_LABEL: Record<StepStatus, string> = {
  pending: "待执行",
  running: "执行中",
  succeeded: "已完成",
  waiting: "待你处理",
  failed: "失败",
  skipped: "未执行",
};

const RUN_STATUS_LABEL: Record<RunResult["status"], string> = {
  queued: "等待推进",
  running: "执行中",
  succeeded: "已完成",
  failed: "已中断",
  cancelled: "已驳回",
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function call<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiResult<T>;
}

export function WorkflowCenter({
  workflows,
  initialRuns,
}: {
  workflows: WfSummary[];
  initialRuns: Record<string, RunResult | null>;
}) {
  const [active, setActive] = useState(workflows[0]?.slug ?? "");
  const [runs, setRuns] = useState<Record<string, RunResult | null>>(initialRuns);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openStep, setOpenStep] = useState<string | null>(null);

  const wf = workflows.find((w) => w.slug === active) ?? workflows[0];
  const run = wf ? runs[wf.slug] ?? null : null;
  const def = run?.definition ?? wf?.definition ?? null;
  const currentStep = def && run?.currentNode ? def.steps.find((s) => s.id === run.currentNode) : null;
  const waitingKind = currentStep?.kind;
  const currentIndex = def && run?.currentNode ? def.steps.findIndex((s) => s.id === run.currentNode) + 1 : 0;
  const stepLabel = currentIndex > 0 ? `第 ${currentIndex} / ${def?.steps.length} 步 · ` : "";

  function apply(next: RunResult) {
    setRuns((prev) => ({ ...prev, [next.workflowSlug]: next }));
    setNote("");
    setError("");
  }

  async function start() {
    if (!wf) return;
    setBusy(true);
    setError("");
    const result = await call<RunResult>(`/api/v1/workflows/${wf.slug}/run`, "POST", {
      goal: goals[wf.slug] ?? "",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    apply(result.data);
    setOpenStep(null);
  }

  async function advance() {
    if (!run) return;
    setBusy(true);
    setError("");
    const result = await call<RunResult>(`/api/v1/workflow-runs/${run.runId}/advance`, "POST");
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    apply(result.data);
  }

  async function decide(decision: "approve" | "reject") {
    if (!run) return;
    setBusy(true);
    setError("");
    const result = await call<RunResult>(`/api/v1/workflow-runs/${run.runId}/decide`, "POST", {
      decision,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    apply(result.data);
  }

  if (!wf) {
    return (
      <div className="status-banner is-error">
        <strong>还没有可用工作流。</strong> 请执行 npm run db:seed 写入内置流程定义。
      </div>
    );
  }

  const steps = def?.steps ?? [];

  return (
    <>
      <div className="wf-tabs" role="tablist" aria-label="选择工作流">
        {workflows.map((w) => {
          const r = runs[w.slug];
          return (
            <button
              key={w.slug}
              role="tab"
              aria-selected={w.slug === active}
              className={`wf-tab${w.slug === active ? " is-active" : ""}`}
              onClick={() => {
                setActive(w.slug);
                setError("");
                setNote("");
                setOpenStep(null);
              }}
            >
              <span className="wf-tab-name">{w.name}</span>
              <span className="wf-tab-meta">
                {w.stepCount} 个节点
                {r ? ` · ${RUN_STATUS_LABEL[r.status]}` : " · 未运行"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="wf-board">
        <div className="wf-board-head">
          <div>
            <h2>{wf.name}</h2>
            <p>{wf.description}</p>
            {def?.deliverable && (
              <p className="wf-deliverable">交付物：{def.deliverable}</p>
            )}
          </div>
          <div className="wf-board-side">
            {run ? (
              <>
                <span className={`wf-run-status is-${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
                <span className="wf-run-id">运行 {run.runId.slice(0, 8)}</span>
              </>
            ) : (
              <span className="wf-run-status is-idle">尚未运行</span>
            )}
          </div>
        </div>

        {!run && (
          <div className="wf-start">
            <label htmlFor={`goal-${wf.slug}`}>这次要研究什么</label>
            <p>
              写清对象、平台、预算与时间，越具体，后面每个节点的产出越能对上你的情形。
              也可以留空，在流程第二步人工填写。
            </p>
            <div className="wf-start-row">
              <input
                id={`goal-${wf.slug}`}
                value={goals[wf.slug] ?? ""}
                maxLength={500}
                placeholder="例如：3 个月内用 2 万元验证家居类目在亚马逊美国站的可行性"
                onChange={(e) => setGoals((prev) => ({ ...prev, [wf.slug]: e.target.value }))}
                disabled={busy}
              />
              <button className="btn-primary" type="button" onClick={() => void start()} disabled={busy}>
                {busy ? "启动中…" : "开始运行"}
              </button>
            </div>
            {!wf.definitionValid && (
              <p className="form-error">该工作流定义不合法，启动会被拒绝。请检查 workflows.definition。</p>
            )}
          </div>
        )}

        {run && run.needsHuman && (
          <div className="wf-gate">
            <div className="wf-gate-head">
              <span className="wf-gate-tag">
                {stepLabel}
                {waitingKind === "gate" ? "人工闸门" : waitingKind === "manual" ? "待填写" : "待确认"}
              </span>
              <strong>{run.currentNodeTitle}</strong>
            </div>
            <p>{run.humanAction}</p>
            <textarea
              value={note}
              maxLength={2000}
              rows={waitingKind === "manual" ? 4 : 3}
              placeholder={
                waitingKind === "manual"
                  ? currentStep?.inputHint ?? "填写这一步需要的内容"
                  : "审核意见（可留空）；驳回时请写明原因"
              }
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
            <div className="wf-gate-actions">
              <button className="btn-primary" type="button" onClick={() => void decide("approve")} disabled={busy}>
                {busy ? "处理中…" : waitingKind === "gate" ? "批准并完成" : "提交并继续"}
              </button>
              <button className="btn-ghost" type="button" onClick={() => void decide("reject")} disabled={busy}>
                驳回并终止
              </button>
              {waitingKind === "check" && (
                <span className="wf-gate-hint">批准表示你已知悉核对问题，仍决定继续。</span>
              )}
            </div>
          </div>
        )}

        {run && !run.needsHuman && run.status === "queued" && (
          <div className="wf-gate">
            <div className="wf-gate-head">
              <span className="wf-gate-tag">
                {stepLabel}可继续
              </span>
              <strong>{run.currentNodeTitle ?? "流程已走到末尾"}</strong>
            </div>
            <p>上一步已完成。点继续会执行下一个节点；遇到人工节点或闸门会再次停下。</p>
            <div className="wf-gate-actions">
              <button className="btn-primary" type="button" onClick={() => void advance()} disabled={busy}>
                {busy ? "执行中…" : "继续执行"}
              </button>
            </div>
          </div>
        )}

        {run && run.status === "succeeded" && (
          <div className="wf-done">
            <strong>这条流程已跑完。</strong>
            <span>
              节点产出在下方可展开查看；报告已写入 reports 表，知识库归档记录可在「知识库」模块查到。
            </span>
            <button className="btn-ghost" type="button" onClick={() => setRuns((prev) => ({ ...prev, [wf.slug]: null }))}>
              再跑一次
            </button>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
      </section>

      {steps.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              <span className="section-index">01 /</span>流程节点
            </h2>
            <p>{run ? "点开任意节点看它的产出与问题清单" : "开始运行前，先看这条路要走几步"}</p>
          </div>

          <ol className="wf-steps">
            {steps.map((step, i) => {
              const state = run?.context.steps[step.id];
              const status = state?.status ?? "pending";
              const open = openStep === step.id;
              const statusText =
                state?.decision === "approve"
                  ? "已通过"
                  : state?.decision === "reject"
                    ? "已驳回"
                    : STATE_LABEL[status];
              return (
                <li key={step.id} className={`wf-step is-${status}`}>
                  <span className="wf-index">{String(i + 1).padStart(2, "0")}</span>
                  <div className="wf-body">
                    <div className="wf-line">
                      <strong>{step.title}</strong>
                      <span className={`wf-kind is-${step.kind}`}>{KIND_LABEL[step.kind]}</span>
                      <span className={`wf-state is-${status}`}>{statusText}</span>
                      {state?.mode === "framework" && <span className="wf-flag">框架产出</span>}
                    </div>
                    <p className="wf-desc">{step.description}</p>

                    {status === "skipped" && state?.reason && (
                      <p className="wf-skip-note">未执行原因：{state.reason}</p>
                    )}

                    {state?.note && status === "failed" && (
                      <p className="wf-skip-note">中断原因：{state.note}</p>
                    )}

                    {state?.issues && state.issues.length > 0 && (
                      <ul className="wf-issues">
                        {state.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}

                    {state?.output && (
                      <div className="wf-output">
                        <button type="button" className="wf-toggle" onClick={() => setOpenStep(open ? null : step.id)}>
                          {open ? "收起产出" : "查看产出"}
                        </button>
                        {state.taskId && (
                          <Link className="wf-link" href="/tasks">
                            关联任务
                          </Link>
                        )}
                        {state.recordId && step.kind === "report" && (
                          <Link className="wf-link" href="/reports">
                            报告记录
                          </Link>
                        )}
                        {state.recordId && step.kind === "archive" && (
                          <Link className="wf-link" href="/knowledge">
                            知识库条目
                          </Link>
                        )}
                        {open && <pre className="wf-pre">{state.output}</pre>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {run && (
        <p className="wf-disclaimer">{run.disclaimer}</p>
      )}
    </>
  );
}

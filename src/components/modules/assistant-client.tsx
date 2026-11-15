"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface PlanStep {
  title: string;
  detail: string;
  agentName: string;
  permissionLevel: string;
  priority: number;
  manual: boolean;
}

interface PlanResult {
  steps: PlanStep[];
  matched: string[];
  mode: string;
  note: string;
}

interface Created {
  id: string;
  title: string;
}

interface DispatchOutcome {
  taskId: string;
  title: string;
  agentSlug: string;
  agentName: string;
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
  runId?: string;
  mode?: string;
  outputChars?: number;
  taskStatus?: string;
}

interface DispatchSummary {
  outcomes: DispatchOutcome[];
  succeeded: number;
  failed: number;
  skipped: number;
  outputChars: number;
  note: string;
}

const priorityLabel: Record<number, string> = { 1: "先做", 2: "其次", 3: "可排后" };

const MODE_LABEL: Record<string, string> = {
  framework: "框架模板",
  mock: "模拟输出",
  model: "真实模型",
};

const STATUS_LABEL: Record<DispatchOutcome["status"], string> = {
  succeeded: "已跑完",
  failed: "执行失败",
  skipped: "需人工",
};

export function PlannerForm({ projectOptions }: { projectOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dispatchNow, setDispatchNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    plan: PlanResult;
    created: Created[];
    dispatch: DispatchSummary | null;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (target.trim().length < 4) {
      setError("把目标写具体一点，比如「想在美国卖宠物冻干零食，看看能不能做」");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: target.trim(),
          projectId: projectId || undefined,
          dispatch: dispatchNow,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { plan: PlanResult; created: Created[]; dispatch: DispatchSummary | null } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setResult(json.data);
      setTarget("");
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务与 PostgreSQL 正在运行");
    } finally {
      setBusy(false);
    }
  }

  const outcomeByTitle = new Map(result?.dispatch?.outcomes.map((o) => [o.title, o]) ?? []);

  return (
    <div className="planner">
      <form onSubmit={onSubmit}>
        <label className="planner-label" htmlFor="assistant-target">
          你想做什么？说得越具体，拆得越准
        </label>
        <textarea
          id="assistant-target"
          className="planner-input"
          rows={3}
          maxLength={500}
          value={target}
          disabled={busy}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="例：想在亚马逊美国站卖宠物冻干零食，预算 5 万人民币，帮我看看能不能做、要准备什么"
        />
        <div className="planner-foot">
          <select
            aria-label="挂到哪个项目"
            value={projectId}
            disabled={busy}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">不挂项目</option>
            {projectOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="planner-check">
            <input
              type="checkbox"
              checked={dispatchNow}
              disabled={busy}
              onChange={(e) => setDispatchNow(e.target.checked)}
            />
            <span>拆完直接派给 Agent 跑</span>
          </label>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? (dispatchNow ? "拆解并派发中…" : "拆解中…") : dispatchNow ? "拆解并派发" : "只拆成任务"}
          </button>
        </div>
        <p className="planner-hint">
          派发只对有对应 Agent 的环节生效；供应链、合规这类没有 Agent 的环节会留在任务中心等你人工处理。
          跑完的任务停在「待确认」，不会被自动标成完成。
        </p>
        {error && <p className="form-error">{error}</p>}
      </form>

      {result && (
        <div className="plan-result">
          <div className="plan-note">
            <strong>来源：内置流程模板</strong>
            <span>{result.plan.note}</span>
          </div>

          {result.dispatch && (
            <div className={`dispatch-summary ${result.dispatch.failed > 0 ? "is-warn" : "is-ok"}`}>
              <strong>{result.dispatch.note}</strong>
              <span>
                产出合计 {result.dispatch.outputChars.toLocaleString("zh-CN")} 字
                {result.dispatch.succeeded > 0 && " · 结果可到「执行记录」看全文"}
              </span>
            </div>
          )}

          <ol className="plan-steps">
            {result.plan.steps.map((step, index) => {
              const outcome = outcomeByTitle.get(step.title);
              return (
                <li key={step.title}>
                  <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="step-body">
                    <h4>{step.title}</h4>
                    <p>{step.detail}</p>
                    <div className="step-meta">
                      <span className={`badge tone-${step.manual ? "warn" : "accent"}`}>
                        {step.manual ? "需人工执行" : step.agentName}
                      </span>
                      <span className="badge">{step.permissionLevel}</span>
                      <span className="step-prio">{priorityLabel[step.priority] ?? ""}</span>
                      {outcome && (
                        <span
                          className={`badge ${
                            outcome.status === "succeeded"
                              ? "tone-ok"
                              : outcome.status === "failed"
                                ? "tone-danger"
                                : "tone-warn"
                          }`}
                        >
                          {STATUS_LABEL[outcome.status]}
                        </span>
                      )}
                      {outcome?.mode && (
                        <span className="step-prio">{MODE_LABEL[outcome.mode] ?? outcome.mode}</span>
                      )}
                      {typeof outcome?.outputChars === "number" && outcome.outputChars > 0 && (
                        <span className="step-prio">
                          {outcome.outputChars.toLocaleString("zh-CN")} 字
                        </span>
                      )}
                    </div>
                    {outcome?.reason && <p className="step-reason">{outcome.reason}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="plan-created">
            已写入 {result.created.length} 条任务
            {result.dispatch
              ? ` · 已派发 ${result.dispatch.succeeded + result.dispatch.failed} 条`
              : " · 可到「任务中心」逐条执行"}
            {" · "}
            <Link href="/tasks">去任务中心确认</Link>
            {" · "}
            <Link href="/runs">看执行记录</Link>
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface PlanStep {
  title: string;
  detail: string;
  agentName: string;
  permissionLevel: string;
  manual: boolean;
}

interface PlanResult {
  steps: PlanStep[];
  note: string;
}

const EXAMPLES = [
  "想在亚马逊美国站卖宠物冻干零食，预算 5 万，看看能不能做",
  "比较 Amazon 和 TikTok Shop 卖小家电，哪个更适合新手",
  "这个产品成本 18 元，卖 19.9 美元，算算还有没有利润",
];

/** 首屏主角：一句目标 → 真实拆解 → 落到任务中心 */
export function HomeComposer() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ plan: PlanResult; count: number } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (target.trim().length < 4) {
      setError("再具体一点：想卖什么、卖到哪，或者卡在哪一步");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { plan: PlanResult; created: { id: string }[] } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setResult({ plan: json.data.plan, count: json.data.created.length });
      setTarget("");
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务与 PostgreSQL 正在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <div className="goal-box">
          <textarea
            value={target}
            rows={2}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="说一句你现在最想解决的事…"
            aria-label="你的目标"
          />
          <div className="goal-actions">
            <span className="goal-hint">拆解来自内置研究流程模板，不调用模型、不产生费用</span>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "拆解中…" : "拆成任务"}
            </button>
          </div>
        </div>
      </form>

      <div className="goal-chips">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip-btn" onClick={() => setTarget(ex)} disabled={busy}>
            {ex.length > 22 ? `${ex.slice(0, 22)}…` : ex}
          </button>
        ))}
      </div>

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}

      {result && (
        <div className="plan-result">
          <div className="plan-note">
            <strong>已拆成 {result.count} 条任务，写进任务中心</strong>
            <span>{result.plan.note}</span>
          </div>
          <ol className="plan-steps">
            {result.plan.steps.map((step, index) => (
              <li key={step.title}>
                <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="step-body">
                  <h4>{step.title}</h4>
                  <div className="step-meta">
                    <span className={`badge tone-${step.manual ? "warn" : "accent"}`}>
                      {step.manual ? "需人工执行" : step.agentName}
                    </span>
                    <span className="badge">{step.permissionLevel}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="plan-created">
            <Link href="/tasks">打开任务中心逐条推进 →</Link>
          </p>
        </div>
      )}
    </div>
  );
}

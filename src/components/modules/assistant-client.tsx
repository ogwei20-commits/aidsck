"use client";

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

const priorityLabel: Record<number, string> = { 1: "先做", 2: "其次", 3: "可排后" };

export function PlannerForm({ projectOptions }: { projectOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ plan: PlanResult; created: Created[] } | null>(null);

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
        body: JSON.stringify({ target: target.trim(), projectId: projectId || undefined }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { plan: PlanResult; created: Created[] } }
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
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "拆解中…" : "拆成任务"}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      {result && (
        <div className="plan-result">
          <div className="plan-note">
            <strong>来源：内置流程模板</strong>
            <span>{result.plan.note}</span>
          </div>
          <ol className="plan-steps">
            {result.plan.steps.map((step, index) => (
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
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="plan-created">
            已写入 {result.created.length} 条任务 · 可到「任务中心」逐条执行
          </p>
        </div>
      )}
    </div>
  );
}

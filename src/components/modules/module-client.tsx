"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ModuleDef, SelectOption } from "@/modules/types";

type ApiResult = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

async function send(url: string, method: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiResult;
}

export type RefMap = Record<string, SelectOption[]>;

function initialValue(def: ModuleDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    if (f.name === def.statusField && def.statusOptions?.length) {
      out[f.name] = def.statusOptions[0].value;
    } else if (f.default !== undefined) {
      out[f.name] = f.default;
    } else {
      out[f.name] = "";
    }
  }
  return out;
}

/** 创建表单：字段完全由模块定义驱动，新增模块不需要改这个文件 */
export function ModuleCreateForm({ def, refs }: { def: ModuleDef; refs: RefMap }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => initialValue(def));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== "") payload[k] = v;
      }
      const result = await send(`/api/v1/modules/${def.slug}`, "POST", payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setValues(initialValue(def));
      setDone("已写入数据库");
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务与 PostgreSQL 正在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mform" onSubmit={onSubmit}>
      <div className="mform-grid">
        {def.fields.map((field) => {
          const id = `${def.slug}-${field.name}`;
          const common = {
            id,
            value: values[field.name] ?? "",
            required: field.required,
            disabled: busy,
            placeholder: field.placeholder,
          };
          return (
            <div
              key={field.name}
              className={`mfield${field.kind === "textarea" ? " is-wide" : ""}`}
            >
              <label htmlFor={id}>
                {field.label}
                {field.required && <span className="req">必填</span>}
              </label>
              {field.kind === "textarea" ? (
                <textarea {...common} rows={3} onChange={(e) => set(field.name, e.target.value)} />
              ) : field.kind === "select" || field.kind === "ref" ? (
                <select {...common} onChange={(e) => set(field.name, e.target.value)}>
                  <option value="">未选择</option>
                  {(field.kind === "ref" ? refs[field.name] ?? [] : field.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...common}
                  type={field.kind === "int" || field.kind === "money" || field.kind === "rate" ? "number" : "text"}
                  step={field.kind === "int" ? 1 : "0.0001"}
                  onChange={(e) => set(field.name, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mform-foot">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "写入中…" : def.createLabel}
        </button>
        {error && <span className="form-error">{error}</span>}
        {done && <span className="mform-done">{done}</span>}
      </div>
    </form>
  );
}

/** 行内操作：改状态（L2 直接生效）、执行（任务专用）、删除（L3 需审批） */
export function RowActions({
  def,
  id,
  status,
}: {
  def: ModuleDef;
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [runResult, setRunResult] = useState<{
    agentName: string;
    mode: "framework" | "mock" | "model";
    hasConclusion: boolean;
    output: string;
    disclaimer: string;
    quality: { pass: boolean; issues: string[] };
  } | null>(null);

  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/v1/tasks/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMessage(json?.error?.message ?? "执行失败");
        return;
      }
      setRunResult(json.data);
      router.refresh();
    } catch {
      setMessage("网络异常，未完成执行");
    } finally {
      setBusy(false);
    }
  }

  const modeLabel =
    runResult?.mode === "framework"
      ? "研究框架"
      : runResult?.mode === "mock"
        ? "模拟调用"
        : "模型输出";

  async function changeStatus(next: string) {
    setBusy(true);
    setMessage("");
    const result = await send(`/api/v1/modules/${def.slug}/${id}`, "PATCH", {
      [def.statusField as string]: next,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    const result = await send(`/api/v1/modules/${def.slug}/${id}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setMessage(
        result.error.code === "APPROVAL_REQUIRED"
          ? "删除需要审批：请先到「安全中心」为这条记录登记并批准，再回来删除。"
          : result.error.message,
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="row-actions">
      {def.slug === "tasks" && (
        <button type="button" className="btn-mini" disabled={busy} onClick={() => void run()}>
          {busy ? "执行中…" : "执行"}
        </button>
      )}
      {def.statusField && def.statusOptions && (
        <select
          aria-label="修改状态"
          value={status}
          disabled={busy}
          onChange={(e) => void changeStatus(e.target.value)}
        >
          {def.statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="link-danger" disabled={busy} onClick={() => void remove()}>
        删除
      </button>
      {message && <span className="row-error">{message}</span>}

      {runResult && (
        <div className="run-panel" role="dialog" aria-label="执行结果">
          <div className="run-panel-head">
            <div>
              <strong>
                {runResult.agentName} · {modeLabel}
              </strong>
              <span>
                任务已进入「待审核」，你确认后才算完成
                {runResult.quality.pass ? "" : ` · 质量检查：${runResult.quality.issues.join("；")}`}
              </span>
            </div>
            <button
              type="button"
              className="run-close"
              onClick={() => setRunResult(null)}
              aria-label="关闭执行结果"
            >
              ×
            </button>
          </div>
          <div className="run-panel-body">
            <pre>{runResult.output}</pre>
          </div>
          <p className="run-panel-note">{runResult.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

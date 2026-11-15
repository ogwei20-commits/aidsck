"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 锁定/解锁汇率。
 *
 * 锁定是把「当时那条汇率」写到方案上，之后汇率表怎么变，
 * 这张卡上的数字都不再变——对账时这一点比「永远最新」重要。
 */
export function LockFxButton({
  scenarioId,
  locked,
}: {
  scenarioId: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/finance/scenarios/${scenarioId}/lock`, {
        method: locked ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? `操作失败（HTTP ${response.status}）`);
        return;
      }
      router.refresh();
    } catch {
      setError("连不上服务，请确认本地服务还在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="fx-lock">
      <button type="button" className="btn-mini" onClick={toggle} disabled={busy}>
        {busy ? "处理中…" : locked ? "解除锁定" : "锁定当前汇率"}
      </button>
      {error && <span className="fx-lock-error" role="alert">{error}</span>}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractStatus } from "@/server/services/file-extract";

const STATUS_LABEL: Record<ExtractStatus, string> = {
  pending: "未解析",
  ok: "已索引",
  empty: "没提取到文字",
  failed: "解析失败",
  unsupported: "不解析",
};

const STATUS_TONE: Record<ExtractStatus, string> = {
  pending: "tone-muted",
  ok: "tone-ok",
  empty: "tone-warn",
  failed: "tone-danger",
  unsupported: "tone-muted",
};

/**
 * 单文件的解析状态与操作。
 *
 * 状态从服务端传来，按钮只负责触发与刷新——不在客户端猜「现在应该是什么状态」。
 * unsupported 不给按钮：点了也不会成功，留个空按钮是骗人。
 */
export function FileExtractButton({
  fileId,
  status,
  charCount,
  error,
}: {
  fileId: string;
  status: ExtractStatus;
  charCount: number;
  error: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/files/${fileId}/extract`, { method });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error?.message ?? `操作失败（HTTP ${response.status}）`);
        return;
      }
      router.refresh();
    } catch {
      setMessage("连不上服务，请确认本地服务还在运行");
    } finally {
      setBusy(false);
    }
  }

  const label =
    status === "ok" ? "重新提取" : status === "failed" || status === "empty" ? "重试" : "提取文字";

  return (
    <div className="file-extract">
      <span
        className={`badge ${STATUS_TONE[status]}`}
        title={error || (status === "ok" ? `已索引 ${charCount.toLocaleString("zh-CN")} 字` : STATUS_LABEL[status])}
      >
        {STATUS_LABEL[status]}
        {status === "ok" && charCount > 0 ? ` · ${charCount.toLocaleString("zh-CN")} 字` : ""}
      </span>

      {status !== "unsupported" && (
        <div className="file-extract-acts">
          <button type="button" className="btn-mini" onClick={() => call("POST")} disabled={busy}>
            {busy ? "处理中…" : label}
          </button>
          {status !== "pending" && (
            <button
              type="button"
              className="btn-mini is-link"
              onClick={() => call("DELETE")}
              disabled={busy}
              title="清掉索引，回到未解析"
            >
              清除
            </button>
          )}
        </div>
      )}
      {message && <span className="file-extract-msg" role="alert">{message}</span>}
    </div>
  );
}

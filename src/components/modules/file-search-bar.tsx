"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 文件全文检索 + 批量解析。
 *
 * 搜索走 form GET，参数用 fq 而不是 q —— q 已经给列表搜索用了，
 * 两者共用会把「搜文件名列表」和「搜正文」搅在一起。
 */
export function FileSearchBar({
  q,
  pendingCount,
}: {
  q: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function indexAll() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/v1/files/extract", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? `解析失败（HTTP ${response.status}）`);
        return;
      }
      const d = payload.data as {
        processed: number;
        ok: number;
        empty: number;
        unsupported: number;
        failed: number;
      };
      if (d.processed === 0) {
        setNotice("没有待解析的文件。已解析过的可以在表格里点「重新提取」。");
      } else {
        setNotice(
          `处理 ${d.processed} 份：成功 ${d.ok}、无文字 ${d.empty}、不解析 ${d.unsupported}、失败 ${d.failed}。`,
        );
      }
      router.refresh();
    } catch {
      setError("连不上服务，请确认本地服务还在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="file-search">
      <form className="file-search-form" action="/files" method="get">
        <label htmlFor="file-fq" className="sr-only">全文检索关键词</label>
        <input
          id="file-fq"
          name="fq"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="搜文件名或文件正文，例如「佣金」「保本单量」"
          maxLength={100}
        />
        <button type="submit" className="btn-primary">搜全文</button>
        {q && (
          <Link className="btn-ghost" href="/files">清除</Link>
        )}
      </form>

      <div className="file-search-tools">
        <button type="button" className="btn-ghost" onClick={indexAll} disabled={busy}>
          {busy ? "解析中…" : `解析全部未处理文件${pendingCount > 0 ? `（${pendingCount}）` : ""}`}
        </button>
        <span className="file-search-hint">
          支持 PDF / Word / txt / md / csv；扫描件、Excel、PPT、图片与压缩包只存原件，不解析。
        </span>
      </div>

      {notice && <p className="form-ok" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DATA_TYPE_LABEL } from "@/lib/utils/format";

/**
 * 证据关联（文档 7.5）。
 *
 * 为什么放在报告页而不是「市场研究」页：
 * 来源的作用是支撑一份报告里的某句结论。离开报告就没有引用位置，
 * 导出时也无处安放。放在报告页，登记完就能立刻导出验证。
 *
 * 只做登记与删除，不做「引用编号自动插入正文」——那需要正文编辑器配合，
 * 这一阶段先保证来源本身可查、可导出、可核对。
 */

export interface CitationItem {
  id: string;
  reportId: string;
  reportTitle: string;
  sourceTitle: string;
  sourceUrl: string;
  quote: string;
  dataType: string;
  dataTypeLabel: string;
  createdAt: string;
}

export interface CitationReportOption {
  id: string;
  title: string;
  citationCount: number;
}

/**
 * 数据类型选项直接取自系统统一口径（文档 4.3），不在这里另写一套。
 * 之前这里把 P 写成「平台/官方口径」、S 写成「二手来源」——和数据库里的
 * 含义不一致，导出附录会自相矛盾。
 */
const DATA_TYPES = (["R", "E", "P", "S", "U"] as const).map((value) => ({
  value,
  label: `${value} · ${DATA_TYPE_LABEL[value]}`,
}));

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function CitationPanel({
  citations,
  reports,
}: {
  citations: CitationItem[];
  reports: CitationReportOption[];
}) {
  const router = useRouter();
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [quote, setQuote] = useState("");
  const [dataType, setDataType] = useState("U");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const view = useMemo(() => citations.filter((c) => !removed[c.id]), [citations, removed]);

  const grouped = useMemo(() => {
    const map = new Map<string, { reportId: string; reportTitle: string; items: CitationItem[] }>();
    for (const item of view) {
      const bucket = map.get(item.reportId) ?? {
        reportId: item.reportId,
        reportTitle: item.reportTitle,
        items: [],
      };
      bucket.items.push(item);
      map.set(item.reportId, bucket);
    }
    return [...map.values()];
  }, [view]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!reportId) {
      setError("先选一份报告——来源必须挂在某份报告上，否则导出时没有位置放它");
      return;
    }
    if (sourceTitle.trim().length < 2) {
      setError("来源名称至少 2 个字符，比如「Amazon 2025 家居类目报告」");
      return;
    }
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) {
      setError("链接必须以 http:// 或 https:// 开头");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/v1/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          sourceTitle: sourceTitle.trim(),
          sourceUrl: sourceUrl.trim(),
          quote: quote.trim(),
          dataType,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) {
        setError(body.error?.message ?? "登记失败");
        return;
      }
      setSourceTitle("");
      setSourceUrl("");
      setQuote("");
      setDataType("U");
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务正在运行");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/v1/citations/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) {
        setError(body.error?.message ?? "删除失败");
        return;
      }
      setRemoved((prev) => ({ ...prev, [id]: true }));
      setConfirmId(null);
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务正在运行");
    }
  }

  return (
    <div className="cite">
      {reports.length === 0 ? (
        <div className="empty-block">
          <p className="empty-title">还没有可挂来源的报告</p>
          <p className="empty-hint">
            来源是结论的凭据。先在
            <Link href="/reports"> 报告中心 </Link>
            建一份报告（哪怕只有标题和一句话结论），再回来登记来源。
          </p>
        </div>
      ) : (
        <>
          <form className="cite-form" onSubmit={add}>
            <label className="cite-field">
              <span>挂到哪份报告</span>
              <select value={reportId} onChange={(e) => setReportId(e.target.value)} disabled={busy}>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.citationCount > 0 ? `（已有 ${r.citationCount} 条）` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="cite-field is-grow">
              <span>来源名称</span>
              <input
                value={sourceTitle}
                maxLength={200}
                disabled={busy}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="Amazon Best Sellers · Home & Kitchen（2025-10）"
              />
            </label>

            <label className="cite-field">
              <span>数据类型</span>
              <select value={dataType} onChange={(e) => setDataType(e.target.value)} disabled={busy}>
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cite-field is-wide">
              <span>链接（可空）</span>
              <input
                value={sourceUrl}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…（线下访谈、内部数据可留空）"
                inputMode="url"
              />
            </label>

            <label className="cite-field is-wide">
              <span>原文摘录（可空）</span>
              <textarea
                value={quote}
                rows={2}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => setQuote(e.target.value)}
                placeholder="把支撑结论的那一句原文抄进来。摘录比转述可靠——转述会在第二次引用时变形。"
              />
            </label>

            <div className="cite-actions">
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "登记中…" : "登记来源"}
              </button>
              <span className="cite-hint">
                每份报告最多 50 条；导出的 .md 与打印页会自动带上来源清单。
              </span>
            </div>
          </form>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <p className="cite-summary">
            共 <strong>{view.length}</strong> 条来源，覆盖 {grouped.length} 份报告。
            {view.length === 0 && " 没有来源的结论不得作为决策依据。"}
          </p>

          {grouped.length === 0 ? (
            <div className="empty-block">
              <p className="empty-title">还没有登记来源</p>
              <p className="empty-hint">
                挑一句你准备写进报告的关键结论，把它的出处填在上面。URL 会打印在导出文件的附录里。
              </p>
            </div>
          ) : (
            <div className="cite-groups">
              {grouped.map((group) => (
                <section className="cite-group" key={group.reportId}>
                  <header className="cite-group-head">
                    <strong>{group.reportTitle}</strong>
                    <span>{group.items.length} 条来源</span>
                  </header>
                  <ol className="cite-list">
                    {group.items.map((item, index) => {
                      const host = hostOf(item.sourceUrl);
                      return (
                        <li className="cite-item" key={item.id}>
                          <span className="cite-no">[{index + 1}]</span>
                          <div className="cite-main">
                            <div className="cite-title-row">
                              <span className="cite-title">{item.sourceTitle}</span>
                              <span className={`cite-type is-${item.dataType.toLowerCase()}`}>
                                {item.dataType} · {item.dataTypeLabel}
                              </span>
                            </div>
                            {item.sourceUrl ? (
                              <a
                                className="cite-url"
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {host || item.sourceUrl}
                              </a>
                            ) : (
                              <span className="cite-url is-empty">无链接（线下或内部来源）</span>
                            )}
                            {item.quote && <blockquote className="cite-quote">{item.quote}</blockquote>}
                          </div>
                          {confirmId === item.id ? (
                            <span className="cite-acts">
                              <button type="button" className="link-danger" onClick={() => void remove(item.id)}>
                                确认删除
                              </button>
                              <button type="button" className="btn-mini" onClick={() => setConfirmId(null)}>
                                取消
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="cite-del"
                              onClick={() => setConfirmId(item.id)}
                              aria-label={`删除来源「${item.sourceTitle}」`}
                            >
                              删除
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

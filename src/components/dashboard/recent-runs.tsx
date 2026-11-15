"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 首页的「最近执行」。
 *
 * 这一段补的是「派活 → 看结果」最后一段路：任务派给 Agent 之后，
 * 结果原本只落在 /runs 里，回到首页看不到，等于活干完了没人收口。
 *
 * 这里做三件事，故意不多做：
 * 1. 直接给出产出开头，不点开也知道产出了什么；
 * 2. 需要细看时展开全文（按需拉详情，首页首屏不为它付请求）；
 * 3. 状态是「待审核」的，就地确认完成，不用再跳任务列表。
 */

export interface HomeRun {
  id: string;
  agentName: string;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  status: string;
  mode: "framework" | "mock" | "model" | "none";
  startedAt: string | null;
  durationMs: number | null;
  outputChars: number;
  outputPreview: string | null;
  error: string | null;
}

const MODE_LABEL: Record<HomeRun["mode"], string> = {
  framework: "框架模板",
  mock: "模拟输出",
  model: "真实模型",
  none: "无产出",
};

const MODE_TONE: Record<HomeRun["mode"], string> = {
  framework: "is-framework",
  mock: "is-mock",
  model: "is-model",
  none: "is-none",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "时间未知";
  const d = new Date(iso);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

function fmtChars(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万字`;
  return `${n.toLocaleString("zh-CN")} 字`;
}

interface Detail {
  messages: { id: string; role: string; content: string }[];
}

export function RecentRuns({ runs }: { runs: HomeRun[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [doneIds, setDoneIds] = useState<Record<string, true>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingReview = runs.filter(
    // 失败的执行不该说「等你确认」：没有产出可确认，它需要的是重跑或改任务
    (r) => r.taskStatus === "review" && r.status !== "failed" && !doneIds[r.id],
  ).length;

  async function toggle(run: HomeRun) {
    if (openId === run.id) {
      setOpenId(null);
      return;
    }
    setOpenId(run.id);
    setError("");
    if (details[run.id]) return;
    setLoadingId(run.id);
    try {
      const res = await fetch(`/api/v1/agent-runs/${run.id}`);
      const body = (await res.json()) as
        | { ok: true; data: Detail }
        | { ok: false; error: { message: string } };
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      setDetails((prev) => ({ ...prev, [run.id]: { messages: body.data.messages } }));
    } catch {
      setError("读取执行详情失败，请稍后重试");
    } finally {
      setLoadingId(null);
    }
  }

  /** 执行完的任务停在 review，就地确认，不用再去任务中心翻 */
  async function confirm(run: HomeRun) {
    if (!run.taskId) return;
    setBusyId(run.id);
    setError("");
    try {
      const res = await fetch(`/api/v1/modules/tasks/${run.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) {
        setError(body.error?.message ?? "确认失败");
        return;
      }
      setDoneIds((prev) => ({ ...prev, [run.id]: true }));
      router.refresh();
    } catch {
      setError("确认失败：请确认本地服务正在运行");
    } finally {
      setBusyId(null);
    }
  }

  if (runs.length === 0) {
    return (
      <div className="empty-block">
        <p className="empty-title">还没有一次执行</p>
        <p className="empty-hint">
          去任务中心挑一条具体任务，点「执行」。Agent 跑完，产出会出现在这里，你能直接看全文、也能就地确认完成。
        </p>
        <p className="empty-action">
          <Link className="btn-ghost" href="/tasks">
            打开任务中心 →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="home-runs">
      <div className="home-runs-head">
        <p>
          {pendingReview > 0 ? (
            <>
              <strong>{pendingReview} 条执行完等你确认</strong>。确认后任务才算完成，不确认就一直挂在「待审核」。
            </>
          ) : (
            <>最近 {runs.length} 次执行。产出只在这里露头，完整记录在「执行记录」。</>
          )}
        </p>
        <Link className="hint" href="/runs">
          全部执行记录 →
        </Link>
      </div>

      {error && (
        <p className="runs-error" role="alert">
          {error}
        </p>
      )}

      <ul className="runs-list">
        {runs.map((run) => {
          const open = openId === run.id;
          const detail = open ? details[run.id] : undefined;
          const isDone = Boolean(doneIds[run.id]);
          const assistant = detail?.messages.filter((m) => m.role === "assistant").at(-1);
          return (
            <li className={`runs-row ${open ? "is-open" : ""}`} key={run.id}>
              <div className="home-run-head">
                <button type="button" className="home-run-main" onClick={() => void toggle(run)} aria-expanded={open}>
                  <strong>{run.taskTitle ?? "（任务已删除）"}</strong>
                  <span className="home-run-sub">
                    {run.agentName} · {fmtTime(run.startedAt)}
                    {run.outputChars > 0 && ` · ${fmtChars(run.outputChars)}`}
                  </span>
                </button>

                <span className="home-run-tags">
                  {/* 失败时只留「执行失败」：再标一个「无产出」是同一件事说两遍 */}
                  {run.status === "failed" ? (
                    <span className="badge tone-danger">执行失败</span>
                  ) : (
                    <span className={`runs-mode ${MODE_TONE[run.mode]}`}>{MODE_LABEL[run.mode]}</span>
                  )}
                  {run.taskStatus === "review" && run.status !== "failed" && !isDone && (
                    <span className="badge tone-warn">待你确认</span>
                  )}
                  {isDone && <span className="badge tone-ok">已确认完成</span>}
                </span>

                <span className="home-run-acts">
                  {run.taskStatus === "review" && !isDone && run.status !== "failed" && (
                    <button
                      type="button"
                      className="btn-mini"
                      disabled={busyId === run.id}
                      onClick={() => void confirm(run)}
                    >
                      {busyId === run.id ? "确认中…" : "确认完成"}
                    </button>
                  )}
                  <button type="button" className="btn-mini" onClick={() => void toggle(run)} aria-expanded={open}>
                    {open ? "收起" : run.outputChars > 0 ? "看产出" : "看详情"}
                  </button>
                </span>
              </div>

              {!open && run.outputPreview && (
                <p className="home-run-preview">{run.outputPreview.replace(/\s+/g, " ").slice(0, 150)}…</p>
              )}

              {!open && !run.outputPreview && run.error && (
                <p className="home-run-preview is-error">失败原因：{run.error}</p>
              )}

              {open && (
                <div className="runs-detail">
                  {loadingId === run.id && <p className="runs-loading">正在读取执行记录…</p>}
                  {!detail && loadingId !== run.id && !error && <p className="runs-loading">没有读到详情</p>}
                  {detail && !assistant && (
                    <p className="runs-loading">
                      {run.error ? `这次执行失败了：${run.error}` : "这次执行没有留下产出。"}
                    </p>
                  )}
                  {assistant && <pre className="home-run-output">{assistant.content}</pre>}
                  {run.taskId && (
                    <p className="home-run-foot">
                      <Link href={`/tasks?q=${encodeURIComponent(run.taskTitle ?? "")}`}>在任务中心查看这条 →</Link>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

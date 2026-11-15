"use client";

import { Fragment, useMemo, useState } from "react";

/** 与服务端 RunSummary 对齐的客户端副本（不把服务端模块打进浏览器包） */
export type RunMode = "framework" | "mock" | "model" | "none";

export interface RunSummary {
  id: string;
  agentName: string;
  agentSlug: string;
  agentPermission: string;
  taskId: string | null;
  taskTitle: string | null;
  taskSource: string | null;
  status: string;
  mode: RunMode;
  provider: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  outputChars: number;
  outputPreview: string | null;
  attemptNo: number;
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  framework: number;
  mock: number;
  model: number;
  outputChars: number;
  totalTokens: number;
}

interface RunMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface RunDetail extends RunSummary {
  messages: RunMessage[];
  agentDescription: string | null;
  systemPrompt: string | null;
}

const MODE_LABEL: Record<RunMode, string> = {
  framework: "框架模板",
  mock: "模拟输出",
  model: "真实模型",
  none: "无产出",
};
const MODE_TONE: Record<RunMode, string> = {
  framework: "is-framework",
  mock: "is-mock",
  model: "is-model",
  none: "is-none",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};
const STATUS_TONE: Record<string, string> = {
  queued: "tone-muted",
  running: "tone-accent",
  succeeded: "tone-ok",
  failed: "tone-danger",
  cancelled: "tone-muted",
};

type Filter = "all" | "model" | "framework" | "failed";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return hm;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** 毫秒说成人话：<1s 给毫秒，>1s 给秒。不四舍五入成「0 秒」。 */
function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** 日期分段：今天 / 昨天 / 具体日期。一屏扫过去要知道「这是哪天的」 */
function dayLabel(iso: string | null): string {
  if (!iso) return "时间未知";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 字符数说成人话：中文一字符、英文一字符，按字符计已经够用 */
function fmtChars(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万字`;
  return `${n.toLocaleString("zh-CN")} 字`;
}

export function AgentRuns({
  runs,
  stats,
  currentMode,
}: {
  runs: RunSummary[];
  stats: RunStats;
  currentMode: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [agentSlug, setAgentSlug] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RunDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  /**
   * Agent 下拉的选项从已有记录里生成，不查 Agent 注册表：
   * 列出「注册了但一次没跑过」的角色只会让人以为筛选坏了。
   */
  const agentOptions = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; count: number }>();
    for (const run of runs) {
      const key = run.agentSlug || run.agentName;
      const found = map.get(key);
      if (found) found.count += 1;
      else map.set(key, { slug: key, name: run.agentName, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }, [runs]);

  const shown = useMemo(() => {
    let list = runs;
    if (filter === "model") list = list.filter((r) => r.mode === "model");
    else if (filter === "framework") list = list.filter((r) => r.mode === "framework");
    else if (filter === "failed") list = list.filter((r) => r.status === "failed");
    if (agentSlug !== "all") list = list.filter((r) => (r.agentSlug || r.agentName) === agentSlug);
    return list;
  }, [runs, filter, agentSlug]);

  const counts: Record<Filter, number> = {
    all: stats.total,
    model: stats.model,
    framework: stats.framework,
    failed: stats.failed,
  };

  async function toggle(run: RunSummary) {
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
        | { ok: true; data: RunDetail }
        | { ok: false; error: { message: string } };
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      setDetails((prev) => ({ ...prev, [run.id]: body.data }));
    } catch {
      setError("加载执行详情失败，请刷新页面重试");
    } finally {
      setLoadingId(null);
    }
  }

  async function copy(runId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(runId);
      setTimeout(() => setCopied((c) => (c === runId ? null : c)), 1600);
    } catch {
      setError("浏览器拒绝了剪贴板访问，请手动选中复制");
    }
  }

  /**
   * 一句话把「这批记录到底是什么」说清楚，比四个孤立数字有用。
   * 三种产出方式要分开报数：把「模拟」混进「真实模型」是在抬价，
   * 把「框架模板」说成「AI 执行」是在冒充。
   */
  const breakdown = [
    stats.model > 0 ? `${stats.model} 次真实模型` : "",
    stats.mock > 0 ? `${stats.mock} 次模拟输出` : "",
    stats.framework > 0 ? `${stats.framework} 次框架模板` : "",
    stats.failed > 0 ? `${stats.failed} 次失败无产出` : "",
  ].filter(Boolean);
  const verdict =
    stats.total === 0
      ? "还没有执行记录。去任务中心把一条任务派给 Agent，执行完这里就有记录。"
      : `共 ${stats.total} 次执行：${breakdown.join(" · ")}。${
          stats.model === 0 ? "没有一次调用真实模型，这些产出不能当研究结论用。" : ""
        }`;

  return (
    <div className="runs">
      <div className="runs-verdict">
        <p>{verdict}</p>
        {currentMode === "none" && stats.model === 0 && (
          <span className="runs-verdict-tag">当前 AI_PROVIDER=none</span>
        )}
      </div>

      <div className="runs-stats">
        <div className="runs-stat">
          <span className="runs-stat-value">{stats.total}</span>
          <span className="runs-stat-label">执行次数</span>
        </div>
        <div className="runs-stat">
          <span className="runs-stat-value">
            {stats.succeeded}
            <em> / </em>
            <b className={stats.failed > 0 ? "is-bad" : ""}>{stats.failed}</b>
          </span>
          <span className="runs-stat-label">成功 / 失败</span>
        </div>
        <div className="runs-stat">
          <span className="runs-stat-value">{stats.model}</span>
          <span className="runs-stat-label">真实模型</span>
        </div>
        <div className="runs-stat">
          <span className="runs-stat-value">{fmtChars(stats.outputChars)}</span>
          <span className="runs-stat-label">累计产出</span>
        </div>
      </div>

      <div className="runs-toolbar">
        <div className="runs-filters" role="tablist" aria-label="按执行方式筛选">
          {(
            [
              ["all", "全部"],
              ["model", "真实模型"],
              ["framework", "框架模板"],
              ["failed", "失败"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`runs-filter ${filter === key ? "is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <em>{counts[key]}</em>
            </button>
          ))}
        </div>
        <p className="runs-hint">点任意一行展开输入与产出全文</p>
      </div>

      {agentOptions.length > 1 && (
        <div className="runs-agent-bar">
          <label htmlFor="runs-agent-filter">按 Agent</label>
          <select
            id="runs-agent-filter"
            value={agentSlug}
            onChange={(e) => setAgentSlug(e.target.value)}
          >
            <option value="all">全部 Agent（{runs.length}）</option>
            {agentOptions.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}（{o.count}）
              </option>
            ))}
          </select>
          {agentSlug !== "all" && (
            <button type="button" className="runs-filter" onClick={() => setAgentSlug("all")}>
              清除 Agent 筛选
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="runs-error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="runs-empty">
          {stats.total === 0
            ? "去任务中心把一条任务派给 Agent，执行完这里就有记录。"
            : agentSlug !== "all"
              ? "这个 Agent 在当前筛选下没有记录。"
              : "这个筛选下没有记录。"}
        </p>
      ) : (
        <ul className="runs-list">
          {shown.map((run, index) => {
            const open = openId === run.id;
            const label = dayLabel(run.startedAt);
            const groupStart = index === 0 || dayLabel(shown[index - 1].startedAt) !== label;
            const d = open ? details[run.id] : undefined;
            return (
              <Fragment key={run.id}>
                {groupStart && (
                  <li className="runs-group-head" aria-hidden="true">
                    <span>{label}</span>
                  </li>
                )}
                <li className={`runs-row ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="runs-row-head"
                  onClick={() => void toggle(run)}
                  aria-expanded={open}
                >
                  <span className="runs-main">
                    <strong className="runs-agent">{run.agentName}</strong>
                    <span className="runs-task">
                      {run.taskTitle ?? "（任务已删除）"}
                      {run.taskSource === "workflow" && <i>工作流</i>}
                      {run.attemptNo > 1 && <i>第 {run.attemptNo} 次</i>}
                    </span>
                  </span>

                  <span className="runs-tags">
                    <span className={`runs-mode ${MODE_TONE[run.mode]}`}>{MODE_LABEL[run.mode]}</span>
                    <span className={`badge ${STATUS_TONE[run.status] ?? "tone-muted"}`}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </span>

                  <span className="runs-metrics">
                    <span>{fmtTime(run.startedAt)}</span>
                    <span>{fmtDuration(run.durationMs)}</span>
                    <span>{run.outputChars > 0 ? fmtChars(run.outputChars) : "—"}</span>
                  </span>

                  <span className="runs-caret" aria-hidden="true">
                    {open ? "收起" : "展开"}
                  </span>
                </button>

                {open && (
                  <div className="runs-detail">
                    {loadingId === run.id && <p className="runs-loading">正在读取执行记录…</p>}

                    {!d && loadingId !== run.id && !error && <p className="runs-loading">没有读到详情</p>}

                    {d && (
                      <>
                        {d.error && (
                          <div className="runs-fail">
                            <strong>失败原因</strong>
                            <p>{d.error}</p>
                          </div>
                        )}

                        <div className="runs-meta">
                          <span>
                            <em>权限</em>
                            {d.agentPermission}
                          </span>
                          <span>
                            <em>耗时</em>
                            {fmtDuration(d.durationMs)}
                          </span>
                          <span>
                            <em>Token</em>
                            {d.mode === "framework"
                              ? "未调用模型"
                              : d.mode === "none"
                                ? "未调用"
                                : `${d.inputTokens} 入 / ${d.outputTokens} 出`}
                          </span>
                          <span>
                            <em>来源</em>
                            {d.taskSource === "workflow" ? "工作流节点" : "手动派活"}
                          </span>
                          <span className="runs-meta-id">
                            <em>记录</em>
                            {d.id.slice(0, 8)}
                          </span>
                        </div>

                        {d.messages.length === 0 && (
                          <p className="runs-loading">
                            这次执行没有留下消息记录。多半是执行在写入产出之前就失败了。
                          </p>
                        )}

                        {d.messages.map((m) => (
                          <div key={m.id} className={`runs-msg is-${m.role}`}>
                            <div className="runs-msg-head">
                              <strong>{m.role === "user" ? "发给 Agent 的输入" : "Agent 的产出"}</strong>
                              <span>{fmtTime(m.createdAt)}</span>
                              {m.role === "assistant" && (
                                <button
                                  type="button"
                                  className="runs-copy"
                                  onClick={() => void copy(run.id, m.content)}
                                >
                                  {copied === run.id ? "已复制" : "复制产出"}
                                </button>
                              )}
                            </div>
                            <pre className="runs-msg-body">{m.content}</pre>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}

      {shown.length > 0 && stats.total > shown.length && (
        <p className="runs-foot">
          只列出最近 {shown.length} 次；上面的统计按全部 {stats.total} 次计算。
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

/**
 * 项目里程碑看板。
 *
 * 为什么值得单独做一块：项目的「进度 40%」如果只是手填的数字，
 * 它既不能解释也不能验收。里程碑是那个凭据——完成 2 条、还差 3 条，
 * 进度才有来源，也才知道下一步该干什么。
 *
 * 交互只保留三个动作：加一条、勾掉、删掉。
 * 不做拖拽排序、不做层级、不做甘特图——这个阶段用不上，
 * 加了只会让人在「怎么用」上花时间。
 */

export interface MilestoneItem {
  id: string;
  projectId: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface MilestoneGroup {
  projectId: string;
  projectName: string;
  projectStatus: string;
  total: number;
  done: number;
  items: MilestoneItem[];
}

interface ProjectRef {
  id: string;
  name: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 逾期天数：只对未完成的算。按「天」比，不按小时，避免同一天内误报 */
function overdueDays(dueAt: string, today: string): number {
  const a = Date.parse(`${dueAt}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

export function MilestoneBoard({
  groups,
  projects,
}: {
  groups: MilestoneGroup[];
  projects: ProjectRef[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneOverride, setDoneOverride] = useState<Record<string, string | null>>({});
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const today = todayStr();

  const view = useMemo(() => {
    return groups
      .map((group) => {
        const items = group.items
          .filter((item) => !removed[item.id])
          .map((item) => ({
            ...item,
            completedAt: doneOverride[item.id] !== undefined ? doneOverride[item.id] : item.completedAt,
          }))
          .sort((a, b) => {
            if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1;
            if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
            if (a.dueAt) return -1;
            if (b.dueAt) return 1;
            return a.createdAt.localeCompare(b.createdAt);
          });
        return {
          ...group,
          items,
          total: items.length,
          done: items.filter((i) => i.completedAt).length,
        };
      })
      .filter((group) => group.total > 0)
      .sort((a, b) => {
        const aOpen = a.total - a.done;
        const bOpen = b.total - b.done;
        if (aOpen === 0 && bOpen > 0) return 1;
        if (bOpen === 0 && aOpen > 0) return -1;
        return a.projectName.localeCompare(b.projectName, "zh-CN");
      });
  }, [groups, doneOverride, removed]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!projectId) {
      setError("先选一个项目");
      return;
    }
    if (title.trim().length < 2) {
      setError("里程碑至少 2 个字符，比如「确定首批 3 个 SKU」");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: title.trim(), dueAt: dueAt || null }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) {
        setError(body.error?.message ?? "添加失败");
        return;
      }
      setTitle("");
      setDueAt("");
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务正在运行");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: MilestoneItem) {
    const next = !item.completedAt;
    setTogglingId(item.id);
    setError("");
    try {
      const res = await fetch(`/api/v1/milestones/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) {
        setError(body.error?.message ?? "更新失败");
        return;
      }
      setDoneOverride((prev) => ({ ...prev, [item.id]: next ? new Date().toISOString() : null }));
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务正在运行");
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/v1/milestones/${id}`, { method: "DELETE" });
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

  const totalAll = view.reduce((sum, g) => sum + g.total, 0);
  const doneAll = view.reduce((sum, g) => sum + g.done, 0);

  return (
    <div className="ms">
      {projects.length === 0 ? (
        <div className="empty-block">
          <p className="empty-title">先有项目，才谈里程碑</p>
          <p className="empty-hint">
            项目是「这一阶段要成什么事」，里程碑是「怎么算成了」。
            <Link href="/projects"> 先建一个项目 </Link>
            再回来定节点。
          </p>
        </div>
      ) : (
        <>
          <form className="ms-add" onSubmit={add}>
            <label className="ms-field">
              <span>项目</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ms-field is-grow">
              <span>里程碑</span>
              <input
                value={title}
                maxLength={160}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="确定首批 3 个 SKU 并各拿到一个供应商报价"
              />
            </label>
            <label className="ms-field">
              <span>截止（可空）</span>
              <input type="date" value={dueAt} disabled={busy} onChange={(e) => setDueAt(e.target.value)} />
            </label>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "添加中…" : "添加"}
            </button>
          </form>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {totalAll > 0 && (
            <p className="ms-summary">
              共 {totalAll} 个节点，完成 <strong>{doneAll}</strong> 个，还剩 {totalAll - doneAll} 个未完成。
            </p>
          )}

          {view.length === 0 ? (
            <div className="empty-block">
              <p className="empty-title">还没有里程碑</p>
              <p className="empty-hint">
                给项目定 3–5 个能验收的节点，比如「拿到 3 家供应商报价」「第一批样品通过检测」。
                节点越具体，进度百分比才越可信。
              </p>
            </div>
          ) : (
            <div className="ms-groups">
              {view.map((group) => {
                const pct = group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
                return (
                  <section className="ms-group" key={group.projectId}>
                    <header className="ms-group-head">
                      <div className="ms-group-title">
                        <strong>{group.projectName}</strong>
                        <span className="ms-count">
                          {group.done} / {group.total}
                        </span>
                      </div>
                      <div className="ms-bar" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className="ms-pct">{pct}%</span>
                    </header>

                    <ul className="ms-list">
                      {group.items.map((item) => {
                        const done = Boolean(item.completedAt);
                        const late = !done && item.dueAt ? overdueDays(item.dueAt, today) : 0;
                        return (
                          <li className={`ms-item${done ? " is-done" : ""}`} key={item.id}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={done}
                              aria-label={done ? `标记「${item.title}」为未完成` : `标记「${item.title}」为完成`}
                              className="ms-check"
                              disabled={togglingId === item.id}
                              onClick={() => void toggle(item)}
                            >
                              {done ? "✓" : ""}
                            </button>

                            <span className="ms-title">{item.title}</span>

                            <span className={`ms-due${late > 0 ? " is-late" : ""}`}>
                              {item.dueAt ? (
                                late > 0 ? (
                                  <>逾期 {late} 天</>
                                ) : (
                                  item.dueAt
                                )
                              ) : done ? (
                                ""
                              ) : (
                                "未设截止"
                              )}
                            </span>

                            {confirmId === item.id ? (
                              <span className="ms-acts">
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
                                className="ms-del"
                                onClick={() => setConfirmId(item.id)}
                                aria-label={`删除「${item.title}」`}
                              >
                                删除
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

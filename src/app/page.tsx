import Link from "next/link";
import { HomeComposer } from "@/components/dashboard/home-composer";
import { RecentRuns } from "@/components/dashboard/recent-runs";
import { humanizeDbError } from "@/lib/errors/humanize";
import { getEnv } from "@/lib/config/env";
import { formatDateTime } from "@/lib/utils/format";
import { getProviderStatus } from "@/server/ai/providers";
import { AGENT_REGISTRY } from "@/server/ai/agents/registry";
import { getAgentRunCounts, getDashboardData, type DashboardData } from "@/server/services/dashboard";
import { listRecentRuns, type RecentRun } from "@/server/services/agent-runs";

export const dynamic = "force-dynamic";

const today = () =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

function headline(data: DashboardData | null): string {
  if (!data) return "先把数据库连上，再谈别的";
  if (data.pendingTasks > 0) return `有 ${data.pendingTasks} 件事等着你拍板`;
  if (data.projects.length === 0) return "先说清楚你想做什么";
  if (data.activeProjects > 0) return "项目在跑，下一步该定什么";
  return "所有任务都清空了，接下来做哪个品";
}

export default async function Home() {
  const userId = getEnv().APP_USER_ID;
  const ai = getProviderStatus();

  let data: DashboardData | null = null;
  let runCounts: Record<string, number> = {};
  let recentRuns: RecentRun[] = [];
  let dbError: string | null = null;

  try {
    data = await getDashboardData(userId);
    runCounts = await getAgentRunCounts();
    recentRuns = await listRecentRuns(userId, 4);
  } catch (error) {
    dbError = humanizeDbError(error);
  }

  const openTasks = (data?.tasks ?? []).filter((t) => t.status === "pending" || t.status === "running").slice(0, 6);
  const activePlans = (data?.plans ?? []).slice(0, 4);
  const profitText = data?.finance
    ? `${data.finance.unitProfit >= 0 ? "+" : "−"}${Math.abs(data.finance.unitProfit).toFixed(2)}`
    : "—";
  // 顶部这句原本写死「当前都没有真实运行记录」，接了执行引擎之后就不再成立
  const ranAgents = Object.values(runCounts).filter((n) => n > 0).length;
  const totalRuns = Object.values(runCounts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {/* ① 首屏：对话是主角 */}
      <section className="hero">
        <div>
          <div className="eyebrow">今天 · {today()}</div>
          <h1>{headline(data)}</h1>
          <p className="hero-lede">
            不用一次想清所有步骤。说一句你现在最想解决的事，剩下的拆解、派活、记账交给系统。
          </p>
          <HomeComposer />
        </div>

        <aside className="hero-side">
          <div>
            <div className="side-label">待处理</div>
            <div className="big-number">{data?.pendingTasks ?? "—"}</div>
            <div className="big-caption">件事等你决定</div>
          </div>
          <div className="side-list">
            <div className="side-row"><span>进行中项目</span><strong>{data?.activeProjects ?? "—"}</strong></div>
            <div className="side-row"><span>累计任务</span><strong>{data?.totalTasks ?? "—"}</strong></div>
            <div className="side-row"><span>已记录操作</span><strong>{data?.logCount ?? "—"}</strong></div>
          </div>
          {data?.lastActivityAt && (
            <div className="side-label">最近一次操作 {formatDateTime(data.lastActivityAt)}</div>
          )}
        </aside>
      </section>

      {dbError && (
        <div className="status-banner is-error">
          <strong>数据库未连通，页面显示空状态而不是伪造数据。</strong>
          <div style={{ marginTop: 6 }}>原因：{dbError}</div>
          <div style={{ marginTop: 6 }}>
            按 README 在 Windows 本机装 PostgreSQL 16，建库后填 .env.local 的 DATABASE_URL，再跑 npm run db:migrate。
          </div>
        </div>
      )}

      {/* ② 生意驾驶舱：四个数字 */}
      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">01 /</span>生意现在什么状态</h2>
          <p>全部来自你自己录入的数据，没有一条是示例</p>
        </div>

        <div className="cockpit">
          <div className="stat">
            <div className="stat-label">在跑的项目</div>
            <div className="stat-value">{data?.activeProjects ?? 0}</div>
            <div className="stat-note">共 {data?.projects.length ?? 0} 个项目</div>
          </div>
          <div className="stat">
            <div className="stat-label">待处理任务</div>
            <div className="stat-value">{data?.pendingTasks ?? 0}</div>
            <div className="stat-note">{data?.runningTasks ?? 0} 条在执行或待审</div>
          </div>
          <div className="stat">
            <div className="stat-label">单件预估净利</div>
            <div className="stat-value">{profitText}</div>
            <div className="stat-note">
              {data?.finance
                ? `${data.finance.currency} · 毛利 ${data.finance.margin.toFixed(1)}%${
                    data.finance.breakEvenUnits > 0 ? ` · 回本 ${data.finance.breakEvenUnits} 单` : ""
                  }`
                : "还没有财务方案"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">已沉淀</div>
            <div className="stat-value">{(data?.recentReports.length ?? 0) + (data?.recentKnowledge.length ?? 0)}</div>
            <div className="stat-note">报告与知识条目</div>
          </div>
        </div>

        <div className="split" style={{ marginTop: 40 }}>
          <div>
            <div className="panel-head">
              <h3>项目</h3>
              <Link className="hint" href="/projects">全部 →</Link>
            </div>
            {data && data.projects.length > 0 ? (
              <ul className="list">
                {data.projects.slice(0, 5).map((p) => (
                  <li key={p.id} className="list-row">
                    <div className="row-main">
                      <div className="row-title">{p.name}</div>
                      <div className="row-meta">{p.goal || p.description || "还没有写目标"}</div>
                      <div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} /></div>
                    </div>
                    <div className="row-side">
                      <span className="badge tone-accent">{p.status}</span>
                      <span className="mono">{p.progress}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-block">
                <p className="empty-title">还没有项目</p>
                <p className="empty-hint">先在首屏写一句目标，拆出来的任务会自动归到项目里。</p>
              </div>
            )}
          </div>

          <div>
            <div className="panel-head">
              <h3>任务</h3>
              <Link className="hint" href="/tasks">全部 →</Link>
            </div>
            {openTasks.length > 0 ? (
              <ul className="list">
                {openTasks.map((t) => (
                  <li key={t.id} className="list-row">
                    <div className="row-main">
                      <div className="row-title">{t.title}</div>
                      <div className="row-meta">{formatDateTime(t.updatedAt)}</div>
                    </div>
                    <div className="row-side">
                      <span className={`badge tone-${t.status === "running" ? "accent" : "warn"}`}>
                        {t.status === "running" ? "执行中" : "待处理"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-block">
                <p className="empty-title">没有待处理任务</p>
                <p className="empty-hint">写一句目标，系统会拆出这个阶段真正该做的事。</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ③ 双轨：做 + 学 */}
      <section className="section is-loose">
        <div className="section-head">
          <h2><span className="section-index">02 /</span>今天做什么，今天学什么</h2>
          <p>两条线同时推进，别只埋头干活</p>
        </div>
        <div className="dual">
          <div className="track">
            <div className="track-head">
              <h3>该做的</h3>
              <span>{openTasks.length} 条</span>
            </div>
            <div className="track-list">
              {openTasks.length === 0 ? (
                <p className="empty-hint">暂时没有待办。首屏写一句目标就会有。</p>
              ) : (
                openTasks.map((t) => (
                  <div className="track-row" key={t.id}>
                    <div className="track-time">{t.status === "running" ? "进行" : "待办"}</div>
                    <div className="track-body">
                      <p>{t.title}</p>
                      <div className="row-meta">{t.detail || "还没有写验收标准"}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="track-foot">
              {openTasks.length > 0
                ? `共 ${openTasks.length} 条待办，${openTasks.filter((t) => t.status === "running").length} 条在执行`
                : "任务来自首屏拆解，不是系统预设"}
            </div>
          </div>
          <div className="track">
            <div className="track-head">
              <h3>该学的</h3>
              <Link className="hint" href="/learning">学习中心 →</Link>
            </div>
            <div className="track-list">
              {activePlans.length === 0 ? (
                <p className="empty-hint">
                  还没有学习计划。跨境最卡人的往往不是选品，是合规、税务和平台规则——先定一个 4 周计划。
                </p>
              ) : (
                activePlans.map((p) => (
                  <div className="track-row" key={p.id}>
                    <div className="track-time">{p.weeklyHours}h/周</div>
                    <div className="track-body">
                      <p>{p.title}</p>
                      <div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} /></div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="track-foot">
              {activePlans.length > 0
                ? `${activePlans.length} 个计划 · 每周共 ${activePlans.reduce((sum, p) => sum + p.weeklyHours, 0)} 小时`
                : "没有计划时，先补齐合规与平台规则这两块"}
            </div>
          </div>
        </div>
      </section>

      {/* ③ 最近执行：派出去的活，有结果了吗 */}
      {!dbError && (
        <section className="section is-loose">
          <div className="section-head">
            <h2><span className="section-index">03 /</span>派出去的活，有结果了吗</h2>
            <p>执行完的产出直接在这里看，不用再跳到执行记录</p>
          </div>
          <RecentRuns runs={recentRuns} />
        </section>
      )}

      {/* ④ 谁在干活 */}
      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">04 /</span>谁在干活</h2>
          <p>
            {ranAgents > 0
              ? `注册了 ${AGENT_REGISTRY.length} 个角色 · ${ranAgents} 个跑过 · 共 ${totalRuns} 次执行`
              : `注册了 ${AGENT_REGISTRY.length} 个角色 · 还没有一次真实运行`}
          </p>
        </div>
        <div className="agent-grid">
          {AGENT_REGISTRY.map((a) => {
            const runs = runCounts[a.agentId] ?? 0;
            return (
              <div className="agent-card" key={a.agentId}>
                <div className="agent-top">
                  <span className="agent-name">{a.name}</span>
                  <span className={`badge tone-${runs > 0 ? "ok" : "muted"}`}>
                    {runs > 0 ? `已跑 ${runs} 次` : "未运行"}
                  </span>
                </div>
                <div className="agent-role">{a.description}</div>
                <div className="agent-foot">{a.permissionLevel} · 超时 {a.timeoutSeconds}s · 最多 {a.executionLimit} 次</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ⑤ 沉淀 */}
      <section className="section is-loose">
        <div className="section-head">
          <h2><span className="section-index">05 /</span>沉淀下来的东西</h2>
          <p>研究完就忘，等于没研究</p>
        </div>
        <div className="split">
          <div>
            <div className="panel-head">
              <h3>最近报告</h3>
              <Link className="hint" href="/reports">报告中心 →</Link>
            </div>
            {data && data.recentReports.length > 0 ? (
              <ul className="list">
                {data.recentReports.map((r) => (
                  <li key={r.id} className="list-row">
                    <div className="row-main">
                      <div className="row-title">{r.title}</div>
                      <div className="row-meta">{r.summary || "还没有写结论"}</div>
                    </div>
                    <div className="row-side"><span className="badge tone-muted">{r.status}</span></div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-block">
                <p className="empty-title">还没有报告</p>
                <p className="empty-hint">研究有结论后在这里成稿，定稿前必须补齐来源。</p>
              </div>
            )}
          </div>
          <div>
            <div className="panel-head">
              <h3>最近知识</h3>
              <Link className="hint" href="/knowledge">知识库 →</Link>
            </div>
            {data && data.recentKnowledge.length > 0 ? (
              <ul className="list">
                {data.recentKnowledge.map((k) => (
                  <li key={k.id} className="list-row">
                    <div className="row-main">
                      <div className="row-title">{k.title}</div>
                      <div className="row-meta">{k.category || "未分类"}</div>
                    </div>
                    <div className="row-side"><span className="badge tone-muted">{k.sourceType}</span></div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-block">
                <p className="empty-title">知识库还是空的</p>
                <p className="empty-hint">把今天查到的一条硬结论存进去，带来源。三个月后它会救你一次。</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ⑥ 边界：真实风险，不是开发进度 */}
      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">06 /</span>现在的边界</h2>
          <p>这些限制是真实存在的，别指望它们不存在</p>
        </div>
        <div className="notice-grid">
          <div className="notice is-warn">
            <h4>AI 没有接入模型</h4>
            <p>{ai.notice}</p>
          </div>
          <div className="notice is-warn">
            <h4>没有登录认证</h4>
            <p>当前只在本机或受控网络使用。未完成认证与安全检查前，不允许直接暴露到公网。</p>
          </div>
          <div className="notice">
            <h4>文件只登记元数据</h4>
            <p>文件中心现在记录文件名、类型与路径，拖拽上传与内容提取在 Sprint 3 补齐，期间请自行归档原件。</p>
          </div>
        </div>
      </section>
    </>
  );
}

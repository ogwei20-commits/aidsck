import { TaskComposer } from "@/components/dashboard/quick-create";
import {
  AuditTable,
  DataTypeLegend,
  ModuleRoadmap,
  ProjectPanel,
  RiskNotices,
  TaskPanel,
} from "@/components/dashboard/sections";
import { getEnv } from "@/lib/config/env";
import { formatDateTime } from "@/lib/utils/format";
import { getProviderStatus } from "@/server/ai/providers";
import { getDashboardSummary, type DashboardSummary } from "@/server/services/workspace";

// 首页数据全部来自数据库；声明为动态渲染，避免 build 阶段连库
export const dynamic = "force-dynamic";

export default async function Home() {
  const ai = getProviderStatus();
  let summary: DashboardSummary | null = null;
  let dbError: string | null = null;

  try {
    summary = await getDashboardSummary(getEnv().APP_USER_ID);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "数据库连接失败";
  }

  const pending = summary?.pendingTaskCount ?? null;

  return (
    <>
      <section className="hero">
        <div>
          <div className="hero-eyebrow">PHASE 1 / SPRINT 1 · 本地工作台</div>
          <h1>
            {pending === null
              ? "先看清今天要做什么，再决定让谁去做"
              : pending > 0
                ? `今天有 ${pending} 件事等你处理`
                : "今天没有待处理任务"}
          </h1>
          <p className="hero-sub">
            跨境电商 AI 智能体工作台。任务、项目与每一条操作记录都写进本机 PostgreSQL，
            关掉页面也不会丢；规划中的能力一律标明，不拿静态页面冒充功能。
          </p>
          <TaskComposer />
          <p className="composer-note">
            当前仅创建任务并落库；AI 规划、Agent 调度与工作流执行将在 Sprint 4–5 接入。
          </p>
        </div>
        <div className="hero-metrics">
          <div>
            <div className="hero-big">{pending ?? "—"}</div>
            <div className="hero-big-label">待处理任务 · 实时来自数据库</div>
          </div>
          <dl className="hero-mini">
            <div><dt>进行中项目</dt><dd>{summary?.activeProjectCount ?? "—"}</dd></div>
            <div><dt>累计任务</dt><dd>{summary?.taskCount ?? "—"}</dd></div>
            <div><dt>已记录操作</dt><dd>{summary?.logCount ?? "—"}</dd></div>
          </dl>
          {summary?.logs[0] && (
            <div className="hero-last">最近操作 · {formatDateTime(summary.logs[0].createdAt)}</div>
          )}
        </div>
      </section>

      {dbError && (
        <div className="status-banner is-error" style={{ marginTop: 24 }}>
          <strong>数据库未连通，首页显示为空状态而非伪造数据。</strong>
          <div style={{ marginTop: 6 }}>原因：{dbError}</div>
          <div style={{ marginTop: 6 }}>
            请按 README 在 Windows 本机安装 PostgreSQL 16，创建数据库后填写 .env.local 的 DATABASE_URL，再执行 npm run db:migrate。
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">01 /</span>此刻的工作</h2>
          <p>项目与任务均从本机数据库读取，可真实创建</p>
        </div>
        <div className="split">
          <ProjectPanel projects={summary?.projects ?? []} />
          <TaskPanel tasks={summary?.tasks ?? []} />
        </div>
      </section>

      <section className="section is-loose">
        <div className="section-head">
          <h2><span className="section-index">02 /</span>最近操作</h2>
          <p>文档 9.2 · 每次写入自动留痕</p>
        </div>
        <AuditTable logs={summary?.logs ?? []} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">03 /</span>风险与边界</h2>
          <p>当前阶段明确不做什么</p>
        </div>
        <RiskNotices ai={ai} dbError={dbError} />
      </section>

      <section className="section is-loose">
        <div className="section-head">
          <h2><span className="section-index">04 /</span>模块交付状态</h2>
          <p>19 个模块逐项标注，S = Sprint</p>
        </div>
        <ModuleRoadmap />
      </section>

      <section className="section">
        <DataTypeLegend />
      </section>
    </>
  );
}

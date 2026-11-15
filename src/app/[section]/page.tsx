import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectComposer, TaskComposer } from "@/components/dashboard/quick-create";
import { AuditTable } from "@/components/dashboard/sections";
import { getEnv } from "@/lib/config/env";
import { findNavItem } from "@/lib/config/navigation";
import { formatDateTime, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/utils/format";
import type { ProjectStatus, TaskStatus } from "@/types";
import {
  listApprovals,
  listAuditLogs,
  listProjects,
  listTasks,
} from "@/server/services/workspace";
import type { AuditLogRow, ProjectRow, TaskRow } from "@/db/schema";

export const dynamic = "force-dynamic";

// Next.js 16：动态段 params 是 Promise
type Ctx = { params: Promise<{ section: string }> };

export default async function SectionPage({ params }: Ctx) {
  const { section } = await params;
  const item = findNavItem(section);
  if (!item) notFound();

  if (item.status === "planned") {
    return (
      <>
        <div className="planned-hero">
          <div className="hero-eyebrow" style={{ color: "var(--accent)" }}>MODULE / {item.sprint}</div>
          <h1>{item.label}</h1>
          <p>{item.description}</p>
        </div>
        <section className="section">
          <div className="status-banner">
            <strong>规划中 · 尚未开发，当前页面只是占位</strong>
            <div style={{ marginTop: 6 }}>
              这里不提供任何业务功能，不会保存输入内容，也不会产生任何费用。按开发蓝图第 1.2 节，
              真实多平台店铺管理、真实订单和库存同步、自动商品发布、自动广告投放、真实客户客服、
              自动退款和采购、企业组织管理、完整 SaaS 多租户、插件市场、复杂商业仿真、
              企业级财务自动化，第一阶段一律不实现。
            </div>
            <div style={{ marginTop: 6 }}>计划交付：{item.sprint}。当前进度见综合首页「模块交付状态」。</div>
          </div>
        </section>
        <section className="section">
          <Link href="/" className="btn-ghost" style={{ display: "inline-block" }}>返回综合首页</Link>
        </section>
      </>
    );
  }

  let dbError: string | null = null;
  let projects: ProjectRow[] = [];
  let tasks: TaskRow[] = [];
  let approvals: AuditLogRow[] = [];
  let logs: AuditLogRow[] = [];

  try {
    const uid = getEnv().APP_USER_ID;
    if (section === "projects") projects = await listProjects(uid, 100);
    if (section === "tasks") tasks = await listTasks(uid, 100);
    if (section === "approvals") {
      approvals = await listApprovals(100);
      logs = await listAuditLogs(100);
    }
  } catch (error) {
    dbError = error instanceof Error ? error.message : "数据库读取失败";
  }

  return (
    <>
      <div className="planned-hero">
        <div className="hero-eyebrow" style={{ color: "var(--accent)" }}>MODULE / {item.sprint} / 最小版</div>
        <h1>{item.label}</h1>
        <p>{item.description}</p>
      </div>

      <section className="section">
        <div className="status-banner">
          <strong>最小可用版（partial）</strong>
          <div style={{ marginTop: 6 }}>
            当前仅支持创建与查看，数据真实落库。编辑、删除、里程碑、附件、批量操作与完整交互在 {item.sprint} 交付，
            请勿把本页当作完整功能。
          </div>
        </div>
        {dbError && (
          <div className="status-banner is-error" style={{ marginTop: 16 }}>
            <strong>数据库未连通。</strong> {dbError} 请按 README 配置 .env.local 并执行 npm run db:migrate。
          </div>
        )}
      </section>

      {section === "projects" && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">01 /</span>项目列表</h2>
            <p>共 {projects.length} 条 · 来自 PostgreSQL</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>项目名称</th><th>状态</th><th>进度</th><th>数据类型</th><th>更新时间</th></tr></thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={5} className="empty">暂无项目，可在下方创建。</td></tr>
                ) : projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><span className="badge">{PROJECT_STATUS_LABEL[p.status as ProjectStatus]}</span></td>
                    <td className="mono">{p.progress}%</td>
                    <td className="mono">{p.dataType}</td>
                    <td className="mono">{formatDateTime(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel" style={{ marginTop: 24 }}><ProjectComposer /></div>
        </section>
      )}

      {section === "tasks" && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">01 /</span>任务列表</h2>
            <p>共 {tasks.length} 条 · 来自 PostgreSQL</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>任务标题</th><th>状态</th><th>来源</th><th>优先级</th><th>创建时间</th></tr></thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr><td colSpan={5} className="empty">暂无任务，可在下方创建。</td></tr>
                ) : tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td><span className="badge">{TASK_STATUS_LABEL[t.status as TaskStatus]}</span></td>
                    <td className="mono">{t.source}</td>
                    <td className="mono">P{t.priority}</td>
                    <td className="mono">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel" style={{ marginTop: 24 }}><TaskComposer variant="panel" /></div>
        </section>
      )}

      {section === "approvals" && (
        <>
          <section className="section">
            <div className="section-head">
              <h2><span className="section-index">01 /</span>审批与权限</h2>
              <p>文档 9 · L1–L4 分级</p>
            </div>
            <div className="notices">
              <div className="notice">
                <div>
                  <h4>归档操作受审批闸门保护</h4>
                  <p>
                    将项目状态改为「已归档」属于 L3 破坏性操作。若审计日志中没有对应的 approve 记录，
                    API 会返回 403 并阻止执行。测试 tests/integration/permissions.test.ts 覆盖此行为。
                  </p>
                </div>
              </div>
              <div className="notice is-warn">
                <div>
                  <h4>当前为最小骨架</h4>
                  <p>审批中心 UI、审批流、预算消耗记录与完整权限模型在 Sprint 4 交付；本页只展示真实审计记录。</p>
                </div>
              </div>
            </div>
          </section>
          <section className="section is-loose">
            <div className="section-head"><h2><span className="section-index">02 /</span>审批记录</h2><p>共 {approvals.length} 条</p></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>时间</th><th>决定</th><th>对象</th><th>备注</th></tr></thead>
                <tbody>
                  {approvals.length === 0 ? (
                    <tr><td colSpan={4} className="empty">尚无审批记录。可通过 POST /api/v1/approvals 写入。</td></tr>
                  ) : approvals.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{formatDateTime(a.createdAt)}</td>
                      <td><span className={`badge${a.action === "approve" ? " is-active" : " is-warn"}`}>{a.action}</span></td>
                      <td>{a.entityType} / <span className="mono">{a.entityId?.slice(0, 8)}</span></td>
                      <td className="mono">{JSON.stringify(a.detail).slice(0, 80)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="section">
            <div className="section-head"><h2><span className="section-index">03 /</span>操作日志</h2><p>最近 100 条</p></div>
            <AuditTable logs={logs} />
          </section>
        </>
      )}

      <section className="section">
        <Link href="/" className="btn-ghost" style={{ display: "inline-block" }}>返回综合首页</Link>
      </section>
    </>
  );
}

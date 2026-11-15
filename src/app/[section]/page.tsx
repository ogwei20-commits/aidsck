import { notFound } from "next/navigation";
import { ModuleCreateForm, type RefMap } from "@/components/modules/module-client";
import { ModuleTable } from "@/components/modules/module-table";
import { ListToolbar } from "@/components/modules/list-toolbar";
import { FinanceResults } from "@/components/modules/finance-result";
import { AssistantWorkspace } from "@/components/modules/assistant";
import { LineageView } from "@/components/modules/lineage";
import { FileUpload } from "@/components/modules/file-upload";
import { FileTable } from "@/components/modules/file-table";
import { ReportExport } from "@/components/modules/report-export";
import { WorkflowCenter } from "@/components/modules/workflow-center";
import { AgentRuns } from "@/components/modules/agent-runs";
import { MilestoneBoard } from "@/components/modules/milestone-board";
import { getEnv } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { listRowsPaged, refOptions, type PagedRows, type Row } from "@/modules/store";
import { getWorkflowRun, listWorkflowsWithRuns } from "@/server/ai/workflows/engine";
import { listRunCenter, type RunCenter } from "@/server/services/agent-runs";
import { listMilestones, type MilestoneGroup } from "@/server/services/milestones";

export const dynamic = "force-dynamic";

// Next.js 16：动态段 params 与 searchParams 都是 Promise
type Ctx = {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 20;

/** 从 query 里取单值字符串，数组（?q=a&q=b）只取第一个 */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function SectionPage({ params, searchParams }: Ctx) {
  const { section } = await params;
  const sp = await searchParams;
  const userId = getEnv().APP_USER_ID;

  if (section === "assistant") return <AssistantWorkspace userId={userId} />;
  if (section === "lineage") return <LineageView userId={userId} />;

  if (section === "runs") {
    // 执行记录单独成页：它是「看 Agent 干了什么」的地方，
    // 和管理 Agent（注册、权限、启停）是两件事，塞在一起两边都做不好。
    let center: RunCenter | null = null;
    let error: string | null = null;
    try {
      center = await listRunCenter(userId);
    } catch (e) {
      error = e instanceof Error ? e.message : "执行记录读取失败";
    }

    return (
      <>
        <header className="page-head">
          <div className="page-head-main">
            <div className="eyebrow">执行 / 执行记录</div>
            <h1>执行记录</h1>
            <p>
              Agent 每跑一次都留一条：发给它的输入、它产出的原文、花了多久、以及这次产出到底算不算数。
              点任意一行展开全文。
            </p>
          </div>
          <div className="page-head-side">
            <div className="count-block">
              <span className="count-value">{center?.stats.total ?? 0}</span>
              <span className="count-label">次执行</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="status-banner is-error">
            <strong>执行记录读取失败。</strong> {error}
          </div>
        )}

        {center && (
          <section className="section is-loose">
            <AgentRuns runs={center.runs} stats={center.stats} currentMode={center.currentMode} />
          </section>
        )}
      </>
    );
  }

  if (section === "workflows") {
    const list = await listWorkflowsWithRuns(userId);
    const runs: Record<string, Awaited<ReturnType<typeof getWorkflowRun>> | null> = {};
    for (const wf of list) {
      runs[wf.slug] = wf.lastRun ? await getWorkflowRun(userId, wf.lastRun.id).catch(() => null) : null;
    }
    return (
      <>
        <header className="page-head">
          <div className="page-head-main">
            <div className="eyebrow">执行 / 工作流中心</div>
            <h1>工作流中心</h1>
            <p>
              把「研究 → 分析 → 核对 → 报告 → 审核」固化成可重跑的链路。
              每次推进都写入执行记录；人工闸门不通过，流程不会前进。
            </p>
          </div>
          <div className="page-head-side">
            <div className="count-block">
              <span className="count-value">{list.length}</span>
              <span className="count-label">条流程</span>
            </div>
          </div>
        </header>
        <WorkflowCenter workflows={list} initialRuns={runs} />
      </>
    );
  }

  const def = getModule(section);
  if (!def) notFound();

  const q = single(sp.q).slice(0, 100);
  const pageNo = Number(single(sp.page)) || 1;

  let rows: Row[] = [];
  let paged: PagedRows = { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1, q };
  let dbError: string | null = null;
  try {
    paged = await listRowsPaged(def, userId, { q, page: pageNo, pageSize: PAGE_SIZE });
    rows = paged.rows;
  } catch (error) {
    dbError = error instanceof Error ? error.message : "数据库读取失败";
  }

  const refs: RefMap = {};
  for (const field of def.fields) {
    if (field.kind === "ref" && field.refTable && field.refLabel) {
      refs[field.name] = await refOptions(field.refTable, field.refLabel, userId);
    }
  }

  const isFiles = def.slug === "files";
  const isProjects = def.slug === "projects";

  // 里程碑只属于项目页。单独 try：读不到里程碑不该连项目列表一起打不开
  let milestones: MilestoneGroup[] = [];
  if (isProjects) {
    try {
      milestones = await listMilestones(userId);
    } catch (error) {
      dbError = dbError ?? (error instanceof Error ? error.message : "里程碑读取失败");
    }
  }

  const fileRows = isFiles
    ? rows.map((r) => ({
        id: String(r.id),
        filename: String(r.filename ?? ""),
        mimeType: String(r.mimeType ?? ""),
        sizeBytes: Number(r.sizeBytes ?? 0),
        purpose: String(r.purpose ?? ""),
        checksum: String(r.checksum ?? ""),
        createdAt: r.createdAt instanceof Date ? r.createdAt : String(r.createdAt ?? ""),
      }))
    : [];

  return (
    <>
      <header className="page-head">
        <div className="page-head-main">
          <div className="eyebrow">{def.group} / {def.label}</div>
          <h1>{def.label}</h1>
          <p>{def.purpose}</p>
        </div>
        <div className="page-head-side">
          <div className="count-block">
            <span className="count-value">{paged.total}</span>
            <span className="count-label">{q ? "条匹配" : "条记录"}</span>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="status-banner is-error">
          <strong>数据库未连通。</strong> {dbError} 请按 README 配置 .env.local 并执行 npm run db:migrate。
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">01 /</span>{def.createLabel}</h2>
          <p>
            {isFiles
              ? "原件存本机磁盘，元数据与 SHA-256 校验和入库"
              : "提交后立即写入 PostgreSQL，可刷新验证"}
          </p>
        </div>
        {isFiles ? <FileUpload /> : <ModuleCreateForm def={def} refs={refs} />}
      </section>

      {/* 项目页多一块里程碑：进度百分比必须来自可验收的节点，而不是手填一个数字 */}
      {isProjects && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">02 /</span>里程碑</h2>
            <p>项目进度不是填出来的，是这些节点一条条完成出来的</p>
          </div>
          <MilestoneBoard
            groups={milestones}
            projects={rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "未命名项目") }))}
          />
        </section>
      )}

      {def.slug === "finance" && rows.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">02 /</span>算出来的结果</h2>
            <p>公式固定，改任一输入都会重算</p>
          </div>
          <FinanceResults rows={rows} />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-index">{isProjects || def.slug === "finance" ? "03" : "02"} /</span>
            {isFiles ? "已上传文件" : "全部记录"}
          </h2>
          <p>{isFiles ? "下载会校验路径，磁盘缺件时明确报错" : def.scope === "shared" ? "含系统内置项" : "仅当前用户数据"}</p>
        </div>
        <ListToolbar
          basePath={`/${def.slug}`}
          q={paged.q}
          total={paged.total}
          page={paged.page}
          totalPages={paged.totalPages}
          pageSize={paged.pageSize}
          itemLabel={def.label.replace(/中心$/, "")}
        />
        {isFiles ? (
          <FileTable rows={fileRows} />
        ) : (
          <ModuleTable
            def={def}
            rows={rows}
            emptyTitle={paged.q ? "没有匹配的记录" : undefined}
            emptyHint={
              paged.q
                ? `换个关键词试试。当前搜的是「${def.label}」里的标题、摘要与正文，不含状态值。`
                : undefined
            }
          />
        )}
      </section>

      {def.slug === "reports" && rows.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">03 /</span>导出</h2>
            <p>导出即成品：正文原样带出，末尾附来源清单与数据类型说明</p>
          </div>
          <ReportExport rows={rows} />
        </section>
      )}
    </>
  );
}

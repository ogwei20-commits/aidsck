import { notFound } from "next/navigation";
import { ModuleCreateForm, type RefMap } from "@/components/modules/module-client";
import { ModuleTable } from "@/components/modules/module-table";
import { ListToolbar } from "@/components/modules/list-toolbar";
import { FinanceResults } from "@/components/modules/finance-result";
import { RatePanel } from "@/components/modules/rate-panel";
import { AssistantWorkspace } from "@/components/modules/assistant";
import { LineageView } from "@/components/modules/lineage";
import { FileUpload } from "@/components/modules/file-upload";
import { FileTable } from "@/components/modules/file-table";
import { FileSearchBar } from "@/components/modules/file-search-bar";
import { FileSearchResults } from "@/components/modules/file-search-results";
import { ReportExport } from "@/components/modules/report-export";
import { CitationPanel } from "@/components/modules/citation-panel";
import { WorkflowCenter } from "@/components/modules/workflow-center";
import { AgentRuns } from "@/components/modules/agent-runs";
import { MilestoneBoard } from "@/components/modules/milestone-board";
import { getEnv } from "@/lib/config/env";
import { humanizeDbError } from "@/lib/errors/humanize";
import { getModule } from "@/modules/registry";
import { listRowsPaged, refOptions, type PagedRows, type Row } from "@/modules/store";
import { getWorkflowRun, listWorkflowsWithRuns } from "@/server/ai/workflows/engine";
import { listRunCenter, type RunCenter } from "@/server/services/agent-runs";
import { listCitations, listReportOptions, type CitationView, type ReportOption } from "@/server/services/citations";
import { listMilestones, type MilestoneGroup } from "@/server/services/milestones";
import { listEffectiveQuotes, listRatePairs, type RatePair } from "@/server/services/rates";
import { searchFiles, type FileSearchResult } from "@/server/services/file-search";
import { countPendingFiles } from "@/server/services/file-extract";
import type { ExtractStatus } from "@/server/services/file-extract";
import type { FxQuote } from "@/lib/finance/fx";

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
    // 筛选与分页都在服务端：客户端筛只能筛当前页，条数会越翻越对不上。
    let center: RunCenter | null = null;
    let error: string | null = null;

    const modeParam = single(sp.mode);
    const statusParam = single(sp.status);
    const runQuery = {
      q: single(sp.q).slice(0, 100),
      mode: ["all", "framework", "mock", "model", "none"].includes(modeParam) ? modeParam : "all",
      status: ["all", "succeeded", "failed", "running"].includes(statusParam) ? statusParam : "all",
      agent: single(sp.agent).slice(0, 60),
    };
    const runPage = Number(single(sp.page)) || 1;

    try {
      center = await listRunCenter(userId, { ...runQuery, page: runPage, pageSize: 20 });
    } catch (e) {
      error = humanizeDbError(e);
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
            <AgentRuns
              runs={center.runs}
              stats={center.stats}
              currentMode={center.currentMode}
              query={center.query}
              pageInfo={{
                page: center.page,
                pageSize: center.pageSize,
                totalPages: center.totalPages,
                total: center.filteredTotal,
              }}
              agents={center.agents}
            />
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
  /** fq 是全文检索关键词；与列表搜索 q 分开，否则两个搜索会互相覆盖 */
  const fq = single(sp.fq).slice(0, 100);
  const pageNo = Number(single(sp.page)) || 1;

  let rows: Row[] = [];
  let paged: PagedRows = { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1, q };
  let dbError: string | null = null;
  try {
    paged = await listRowsPaged(def, userId, { q, page: pageNo, pageSize: PAGE_SIZE });
    rows = paged.rows;
  } catch (error) {
    dbError = humanizeDbError(error);
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
      dbError = dbError ?? humanizeDbError(error);
    }
  }

  // 证据关联只属于报告页。同样单独 try：来源读不到不应连报告列表一起打不开
  let citationItems: CitationView[] = [];
  let citationReports: ReportOption[] = [];
  if (def.slug === "reports") {
    try {
      [citationItems, citationReports] = await Promise.all([listCitations(userId), listReportOptions(userId)]);
    } catch (error) {
      dbError = dbError ?? humanizeDbError(error);
    }
  }

  // 汇率只属于财务页：方案要按它折算成本。读不到时结果卡会标「汇率缺失」而不是整页崩
  let fxQuotes: FxQuote[] = [];
  let ratePairs: RatePair[] = [];
  if (def.slug === "finance") {
    try {
      [fxQuotes, ratePairs] = await Promise.all([listEffectiveQuotes(), listRatePairs()]);
    } catch (error) {
      dbError = dbError ?? humanizeDbError(error);
    }
  }

  // 全文检索只属于文件页。有关键词才查，别让每个文件页都白跑一次搜索
  let searchResult: FileSearchResult | null = null;
  let pendingCount = 0;
  if (isFiles) {
    try {
      const [pending, search] = await Promise.all([
        countPendingFiles(userId),
        fq ? searchFiles(userId, fq) : Promise.resolve(null),
      ]);
      pendingCount = pending;
      searchResult = search;
    } catch (error) {
      dbError = dbError ?? humanizeDbError(error);
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
        extractStatus: (String(r.extractStatus ?? "pending") || "pending") as ExtractStatus,
        charCount: Number(r.charCount ?? 0),
        extractError: String(r.extractError ?? ""),
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
          <strong>数据库未连通。</strong> {dbError} 修好后刷新本页。
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
            <p>公式固定，改任一输入都会重算；成本币种不同时按汇率折算，并写明用的是哪条汇率</p>
          </div>
          <FinanceResults rows={rows} rates={fxQuotes} />
        </section>
      )}

      {def.slug === "finance" && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">03 /</span>汇率</h2>
            <p>只追加不覆盖：同一天改主意就再录一条，旧的那条留在历史里，上个月的账才对得上</p>
          </div>
          <RatePanel pairs={ratePairs} />
        </section>
      )}

      {isFiles && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">02 /</span>全文检索</h2>
            <p>搜文件名与已解析的正文；命中处标出关键词，点文件名可下载原件</p>
          </div>
          <FileSearchBar q={fq} pendingCount={pendingCount} />
          {searchResult && <FileSearchResults result={searchResult} />}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-index">{def.slug === "finance" ? "04" : isFiles || isProjects ? "03" : "02"} /</span>
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

      {/* 报告页的来源登记：结论要有出处，导出附录才有内容可带 */}
      {def.slug === "reports" && (
        <section className="section">
          <div className="section-head">
            <h2><span className="section-index">04 /</span>来源</h2>
            <p>给结论挂出处：标题、链接、原文摘录与数据类型，导出时自动进附录</p>
          </div>
          <CitationPanel citations={citationItems} reports={citationReports} />
        </section>
      )}
    </>
  );
}

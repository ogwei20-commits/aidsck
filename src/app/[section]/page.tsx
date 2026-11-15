import { notFound } from "next/navigation";
import { ModuleCreateForm, type RefMap } from "@/components/modules/module-client";
import { ModuleTable } from "@/components/modules/module-table";
import { FinanceResults } from "@/components/modules/finance-result";
import { AssistantWorkspace } from "@/components/modules/assistant";
import { LineageView } from "@/components/modules/lineage";
import { FileUpload } from "@/components/modules/file-upload";
import { FileTable } from "@/components/modules/file-table";
import { ReportExport } from "@/components/modules/report-export";
import { WorkflowCenter } from "@/components/modules/workflow-center";
import { getEnv } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { listRows, refOptions, type Row } from "@/modules/store";
import { getWorkflowRun, listWorkflowsWithRuns } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

// Next.js 16：动态段 params 是 Promise
type Ctx = { params: Promise<{ section: string }> };

export default async function SectionPage({ params }: Ctx) {
  const { section } = await params;
  const userId = getEnv().APP_USER_ID;

  if (section === "assistant") return <AssistantWorkspace userId={userId} />;
  if (section === "lineage") return <LineageView userId={userId} />;

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

  let rows: Row[] = [];
  let dbError: string | null = null;
  try {
    rows = await listRows(def, userId);
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
            <span className="count-value">{rows.length}</span>
            <span className="count-label">条记录</span>
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
          <h2><span className="section-index">{def.slug === "finance" ? "03" : "02"} /</span>{isFiles ? "已上传文件" : "全部记录"}</h2>
          <p>{isFiles ? "下载会校验路径，磁盘缺件时明确报错" : def.scope === "shared" ? "含系统内置项" : "仅当前用户数据"}</p>
        </div>
        {isFiles ? <FileTable rows={fileRows} /> : <ModuleTable def={def} rows={rows} />}
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

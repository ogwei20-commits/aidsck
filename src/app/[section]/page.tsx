import { notFound } from "next/navigation";
import { ModuleCreateForm, type RefMap } from "@/components/modules/module-client";
import { ModuleTable } from "@/components/modules/module-table";
import { FinanceResults } from "@/components/modules/finance-result";
import { AssistantWorkspace } from "@/components/modules/assistant";
import { LineageView } from "@/components/modules/lineage";
import { getEnv } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { listRows, refOptions, type Row } from "@/modules/store";

export const dynamic = "force-dynamic";

// Next.js 16：动态段 params 是 Promise
type Ctx = { params: Promise<{ section: string }> };

export default async function SectionPage({ params }: Ctx) {
  const { section } = await params;
  const userId = getEnv().APP_USER_ID;

  if (section === "assistant") return <AssistantWorkspace userId={userId} />;
  if (section === "lineage") return <LineageView userId={userId} />;

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
          <p>提交后立即写入 PostgreSQL，可刷新验证</p>
        </div>
        <ModuleCreateForm def={def} refs={refs} />
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
          <h2><span className="section-index">{def.slug === "finance" ? "03" : "02"} /</span>全部记录</h2>
          <p>{def.scope === "shared" ? "含系统内置项" : "仅当前用户数据"}</p>
        </div>
        <ModuleTable def={def} rows={rows} />
      </section>
    </>
  );
}

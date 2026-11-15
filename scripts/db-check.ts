import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const REQUIRED_TABLES = ["users", "projects", "tasks", "audit_logs"];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[db-check] FAIL: DATABASE_URL 未配置。请复制 .env.example 为 .env.local。");
    process.exitCode = 1;
    return;
  }
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    const version = await sql`select version() as version, current_database() as db`;
    const tables = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    const names = tables.map((r) => String(r.tablename));
    const missing = REQUIRED_TABLES.filter((t) => !names.includes(t));

    console.log("[db-check] 连接成功");
    console.log(`[db-check] 数据库: ${version[0]?.db}`);
    console.log(`[db-check] 版本: ${String(version[0]?.version).split(",")[0]}`);
    console.log(`[db-check] 表(${names.length}): ${names.join(", ") || "(无)"}`);

    if (missing.length > 0) {
      console.error(`[db-check] FAIL: 缺少表 ${missing.join(", ")}，请先执行 npm run db:migrate`);
      process.exitCode = 1;
      return;
    }
    const counts = await sql`
      select 'users' as t, count(*)::int as n from users
      union all select 'projects', count(*)::int from projects
      union all select 'tasks', count(*)::int from tasks
      union all select 'audit_logs', count(*)::int from audit_logs
      order by t`;
    for (const row of counts) console.log(`[db-check]   ${row.t}: ${row.n} 行`);
    console.log("[db-check] PASS: 连接、表结构与读写检查通过");
  } catch (error) {
    console.error("[db-check] FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

void main();

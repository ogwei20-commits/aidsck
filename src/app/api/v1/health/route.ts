import postgres from "postgres";
import { getEnv } from "@/lib/config/env";
import { ok } from "@/lib/errors/api";
import { getProviderStatus } from "@/server/ai/providers";

export const dynamic = "force-dynamic";

/**
 * 健康检查：真实连接 PostgreSQL，不伪造状态。
 * 未配置 / 连不上时返回 connected=false 与明确原因，供首页与验收脚本读取。
 */
export async function GET() {
  const env = getEnv();
  const ai = getProviderStatus();
  const base = {
    app: { name: "CrossBorder AI Workspace", phase: "Phase 1 / Sprint 1", env: env.APP_ENV },
    ai,
    checkedAt: new Date().toISOString(),
  };

  if (!env.DATABASE_URL) {
    return ok({
      ...base,
      database: {
        configured: false,
        connected: false,
        reason: "DATABASE_URL 未配置，请复制 .env.example 为 .env.local",
        tables: [],
      },
    });
  }

  let client: ReturnType<typeof postgres> | null = null;
  try {
    client = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5 });
    const versionRows = await client`select version() as version, current_database() as db`;
    const tableRows = await client`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    return ok({
      ...base,
      database: {
        configured: true,
        connected: true,
        version: versionRows[0]?.version ?? null,
        database: versionRows[0]?.db ?? null,
        tableCount: tableRows.length,
        tables: tableRows.map((r) => r.tablename),
      },
    });
  } catch (error) {
    return ok({
      ...base,
      database: {
        configured: true,
        connected: false,
        reason: error instanceof Error ? error.message : "未知连接错误",
        tables: [],
      },
    });
  } finally {
    if (client) await client.end({ timeout: 5 }).catch(() => {});
  }
}

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { AppError } from "@/lib/errors/api";
import * as schema from "./schema";

/**
 * 懒连接：模块导入时不连库，保证 `next build` 不因未启动的 PostgreSQL 而失败。
 * 首次真实读写时才建立连接池（max=5，适配 16GB 本地机）。
 */
type Db = PostgresJsDatabase<typeof schema>;

let cachedDb: Db | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;

export function getDb(): Db {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new AppError(
      "DB_NOT_CONFIGURED",
      "数据库未配置：请复制 .env.example 为 .env.local，填写 DATABASE_URL 后重启。系统不会伪造数据。",
      503,
    );
  }
  cachedClient = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  cachedDb = drizzle(cachedClient, { schema });
  return cachedDb;
}

/** 供脚本与测试在进程退出前释放连接 */
export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end({ timeout: 5 });
    cachedClient = null;
    cachedDb = null;
  }
}

export { schema };

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// 本地优先，其次 .env；两者都不提交 Git
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "[drizzle] DATABASE_URL 未配置。请复制 .env.example 为 .env.local 并填写本地 PostgreSQL 连接串。",
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});

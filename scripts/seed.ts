import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * 本地开发种子数据（可重复执行）。
 * 所有条目名称均带 [示例] 前缀，并在元数据中标注「本地开发种子，非真实业务数据」，
 * 绝不把模拟数据标成真实数据（文档 12 禁止行为）。
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] FAIL: DATABASE_URL 未配置");
    process.exitCode = 1;
    return;
  }
  const userId = process.env.APP_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    await sql`insert into users (id, display_name, email)
      values (${userId}, ${"本地用户"}, ${null})
      on conflict (id) do nothing`;

    const existing = await sql`select count(*)::int as n from projects where name like '[示例]%'`;
    if (existing[0].n > 0) {
      console.log("[seed] 已存在示例数据，跳过（不会重复写入）");
      return;
    }

    const project = await sql`
      insert into projects (user_id, name, description, status, progress, data_type)
      values (${userId}, ${"[示例] 东南亚小家电可行性研究"},
        ${"本地开发种子数据，非真实业务数据。用于验证 F-05/F-06 读写链路。"},
        ${"planning"}, ${0}, ${"U"})
      returning id`;
    const projectId = project[0].id;

    await sql`
      insert into tasks (user_id, project_id, title, status, priority, source, data_type)
      values
        (${userId}, ${projectId}, ${"[示例] 整理三个平台的佣金规则"}, ${"pending"}, ${2}, ${"user"}, ${"U"}),
        (${userId}, ${projectId}, ${"[示例] 采集候选品类的公开数据"}, ${"pending"}, ${3}, ${"user"}, ${"U"})`;

    const seedDetail = JSON.stringify({
      note: "本地开发种子，非真实业务数据",
      script: "npm run db:seed",
    });
    await sql`
      insert into audit_logs (user_id, action, entity_type, entity_id, permission_level, detail)
      values (${userId}, ${"create"}, ${"seed"}, ${String(projectId)}, ${"L2"},
        ${seedDetail}::jsonb)`;

    console.log("[seed] 已写入：1 用户 / 1 项目 / 2 任务 / 1 审计日志（均标注为示例数据）");
  } catch (error) {
    console.error("[seed] FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

void main();

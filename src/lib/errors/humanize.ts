/**
 * 把数据库异常翻成人话。
 *
 * 为什么需要：直接把 `Failed query: select "id", ...` 铺在页面上，
 * 一是看不懂，二是把表结构告诉了不该看到的人（局域网里也可能有别人）。
 * 原始错误仍然写进服务端日志，排查不受影响。
 */
export function humanizeDbError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (
    /ECONNREFUSED|ECONNRESET|connection (refused|terminated)|terminating connection|password authentication failed|database ".*" does not exist|role ".*" does not exist/i.test(
      raw,
    )
  ) {
    return "连不上数据库。确认 PostgreSQL 已启动，且 .env.local 里的 DATABASE_URL 指向正确的库与用户。";
  }

  if (/relation .* does not exist|column .* does not exist|undefined (table|column)/i.test(raw)) {
    return "数据表结构不是最新。执行 npm run db:migrate 补齐迁移，再刷新页面。";
  }

  if (/Failed query/i.test(raw)) {
    return "查询没有执行成功。先跑 npm run db:check 自检，终端里能看到完整的 SQL 错误。";
  }

  // 其余错误只留首行，避免把整段堆栈铺在页面上
  return raw.split("\n")[0].slice(0, 160) || "未知错误";
}

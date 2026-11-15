import { describe, expect, it } from "vitest";
import { humanizeDbError } from "@/lib/errors/humanize";

describe("数据库错误翻译", () => {
  it("连接失败给出启动与连接串提示", () => {
    expect(humanizeDbError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toContain("PostgreSQL");
    expect(humanizeDbError(new Error('password authentication failed for user "cbai"'))).toContain("DATABASE_URL");
  });

  it("表结构缺失提示跑迁移", () => {
    expect(humanizeDbError(new Error('relation "tasks" does not exist'))).toContain("db:migrate");
  });

  it("Drizzle 的 Failed query 提示自检，不把 SQL 铺出来", () => {
    const msg = humanizeDbError(new Error('Failed query: select "id", "secret" from "users"'));
    expect(msg).toContain("db:check");
    expect(msg).not.toContain("select");
  });

  it("未知错误只留首行并截断", () => {
    const msg = humanizeDbError(new Error("奇怪错误\n第二行堆栈"));
    expect(msg).toBe("奇怪错误");
    expect(humanizeDbError(new Error("x".repeat(500))).length).toBeLessThanOrEqual(160);
  });

  it("非 Error 输入也能给出可读结果", () => {
    expect(humanizeDbError("boom")).toBe("boom");
    expect(humanizeDbError(undefined)).toBe("未知错误");
  });
});

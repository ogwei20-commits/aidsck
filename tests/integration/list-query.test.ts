import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { projects } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { listRowsPaged } from "@/modules/store";
import { createProject, ensureLocalUser } from "@/server/services/workspace";

const uid = DEFAULT_USER_ID;
const def = getModule("projects")!;

/** 这三条都用固定前缀，清理时按前缀删，不碰用户真实数据 */
const PREFIX = "[测试] 分页";

/** createProject 接收的是 schema 输出类型（默认值已填充），所以这里把默认值显式写全 */
const mkProject = (name: string) =>
  createProject(uid, { name, description: "", status: "planning", dataType: "U" });

describe("列表搜索与分页（真实数据库）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
    await mkProject(`${PREFIX} 甲 选品`);
    await mkProject(`${PREFIX} 乙 供应链`);
    await mkProject("分页 丙 无前缀干扰项");
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(projects).where(like(projects.name, "[测试]%"));
    await db.delete(projects).where(like(projects.name, "分页 丙%"));
    await closeDb();
  });

  it("关键词命中标题，返回总数与分页信息", async () => {
    const result = await listRowsPaged(def, uid, { q: PREFIX, pageSize: 20 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.q).toBe(PREFIX);
    expect(result.totalPages).toBe(1);
  });

  it("总数是筛选后的总数，不是当前页行数", async () => {
    const result = await listRowsPaged(def, uid, { q: PREFIX, page: 1, pageSize: 1 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.totalPages).toBe(2);
  });

  it("翻页返回不同记录，页内不重复", async () => {
    const p1 = await listRowsPaged(def, uid, { q: PREFIX, page: 1, pageSize: 1 });
    const p2 = await listRowsPaged(def, uid, { q: PREFIX, page: 2, pageSize: 1 });
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  it("页码越界时夹到最后一页，而不是给一张空表", async () => {
    const result = await listRowsPaged(def, uid, { q: PREFIX, page: 99, pageSize: 1 });
    expect(result.page).toBe(2);
    expect(result.rows).toHaveLength(1);
  });

  it("% 被当成普通字符，不会把全部记录捞出来", async () => {
    const result = await listRowsPaged(def, uid, { q: "%", pageSize: 100 });
    // 项目名里没有人写百分号，所以命中应为 0；若未转义，这里会是全部项目
    expect(result.total).toBe(0);
  });

  it("关键词去空格后为空则不筛选", async () => {
    const result = await listRowsPaged(def, uid, { q: "   ", pageSize: 100 });
    expect(result.q).toBe("");
    // 至少包含本组刚建的 3 条，说明没有因为空关键词把结果筛没
    expect(result.total).toBeGreaterThanOrEqual(3);
  });
});

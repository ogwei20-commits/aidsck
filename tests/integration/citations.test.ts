import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { citations, reports } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { ensureLocalUser } from "@/server/services/workspace";
import {
  MAX_CITATIONS_PER_REPORT,
  createCitation,
  deleteCitation,
  listCitations,
  listReportOptions,
} from "@/server/services/citations";

/**
 * 证据关联：真库读写 + 归属隔离。
 *
 * 重点不在「能不能存进去」，而在两条容易出事的边界：
 * 1. 跨用户的 reportId / citationId 必须 404，且不能删掉别人的数据；
 * 2. 每份报告的来源数有上限，超过时明确报 409，而不是静默丢弃。
 */

const uid = DEFAULT_USER_ID;
const OTHER_UID = "00000000-0000-4000-8000-00000000c17e";

let reportId = "";
let otherReportId = "";

describe("证据关联真实读写", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);

    const db = getDb();
    const [mine] = await db
      .insert(reports)
      .values({
        userId: uid,
        title: "[测试] 宠物冻干零食美国站可行性",
        summary: "结论：先做小批量试销",
        body: "# 结论\n\n试销 200 件。",
        status: "draft",
      })
      .returning({ id: reports.id });
    reportId = mine.id;

    const [other] = await db
      .insert(reports)
      .values({ userId: OTHER_UID, title: "[测试] 别人的报告", status: "draft" })
      .returning({ id: reports.id });
    otherReportId = other.id;
  });

  afterAll(async () => {
    const db = getDb();
    // 删报告会级联删来源
    await db.delete(reports).where(like(reports.title, "[测试]%"));
    await closeDb();
  });

  it("登记后能读回，数据类型带中文标签", async () => {
    const item = await createCitation(uid, {
      reportId,
      sourceTitle: "[测试] Amazon Best Sellers",
      sourceUrl: "https://www.amazon.com/best-sellers",
      quote: "Home & Kitchen 第一名月销 4 万件",
      dataType: "P",
    });

    expect(item.reportId).toBe(reportId);
    expect(item.dataTypeLabel).toContain("预测");

    const list = await listCitations(uid, reportId);
    expect(list).toHaveLength(1);
    expect(list[0].sourceUrl).toBe("https://www.amazon.com/best-sellers");
  });

  it("报告下拉带已登记来源数", async () => {
    const options = await listReportOptions(uid);
    const mine = options.find((o) => o.id === reportId);
    expect(mine).toBeDefined();
    expect(mine?.citationCount).toBeGreaterThanOrEqual(1);
    // 别人的报告不该出现在自己的下拉里
    expect(options.some((o) => o.id === otherReportId)).toBe(false);
  });

  it("不能给别人的报告登记来源", async () => {
    await expect(
      createCitation(uid, {
        reportId: otherReportId,
        sourceTitle: "[测试] 越权来源",
        sourceUrl: "",
        quote: "",
        dataType: "U",
      }),
    ).rejects.toMatchObject({ status: 404, code: "REPORT_NOT_FOUND" });
  });

  it("不能删除别人的来源", async () => {
    const db = getDb();
    const [foreign] = await db
      .insert(citations)
      .values({ reportId: otherReportId, sourceTitle: "[测试] 别人的来源", dataType: "U" })
      .returning({ id: citations.id });

    await expect(deleteCitation(uid, foreign.id)).rejects.toMatchObject({ status: 404 });

    // 确认真的没删掉
    const still = await db.select({ id: citations.id }).from(citations).where(eq(citations.id, foreign.id));
    expect(still).toHaveLength(1);

    await db.delete(citations).where(eq(citations.id, foreign.id));
  });

  it("删除自己的来源后再列就没有了", async () => {
    const item = await createCitation(uid, {
      reportId,
      sourceTitle: "[测试] 待删除来源",
      sourceUrl: "https://example.com/report",
      quote: "",
      dataType: "S",
    });

    await deleteCitation(uid, item.id);
    const list = await listCitations(uid, reportId);
    expect(list.some((c) => c.id === item.id)).toBe(false);

    await expect(deleteCitation(uid, item.id)).rejects.toMatchObject({ status: 404 });
  });

  it("每份报告有来源上限，超出返回 409", async () => {
    const db = getDb();
    const [solo] = await db
      .insert(reports)
      .values({ userId: uid, title: "[测试] 来源上限报告", status: "draft" })
      .returning({ id: reports.id });

    await db.insert(citations).values(
      Array.from({ length: MAX_CITATIONS_PER_REPORT }, (_, i) => ({
        reportId: solo.id,
        sourceTitle: `[测试] 来源 ${i + 1}`,
        dataType: "U" as const,
      })),
    );

    await expect(
      createCitation(uid, {
        reportId: solo.id,
        sourceTitle: "[测试] 第 51 条",
        sourceUrl: "",
        quote: "",
        dataType: "U",
      }),
    ).rejects.toMatchObject({ status: 409, code: "CITATION_LIMIT_EXCEEDED" });

    // 清理这条报告及其来源，避免影响后续断言
    await db.delete(reports).where(and(eq(reports.id, solo.id), eq(reports.userId, uid)));
  });
});

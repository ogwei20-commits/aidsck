import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { citations, reports } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { DATA_TYPE_LABEL, isUuid } from "@/lib/utils/format";
import type { CreateCitationInput } from "@/lib/validation/schemas";

/**
 * 证据关联（文档 5.x / 7.5）。
 *
 * 为什么来源挂在报告上，而不是挂在「任意结论」上：
 * 一条结论只有在某份报告里才有稳定的引用位置（导出时能带附录、能回查）。
 * 挂到知识点上会让同一句话在不同报告里重复登记，反而更难核对。
 *
 * 三条硬约束：
 * 1. 只能给**自己的**报告登记来源；跨用户 reportId 一律 404，不泄漏「这份报告存在」。
 * 2. 链接只存 http/https。导出文件会被带到别的机器打开，javascript: 就是注入面。
 * 3. 每份报告最多 50 条——来源清单是给人看的，不是爬虫的结果集。
 */

export const MAX_CITATIONS_PER_REPORT = 50;

export interface CitationView {
  id: string;
  reportId: string;
  reportTitle: string;
  sourceTitle: string;
  sourceUrl: string;
  quote: string;
  dataType: string;
  dataTypeLabel: string;
  createdAt: string;
}

export interface ReportOption {
  id: string;
  title: string;
  citationCount: number;
}

function iso(value: Date | string | null): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** 报告下拉：只列自己的报告，并带上已登记来源数，避免点进去才发现是空的 */
export async function listReportOptions(userId: string): Promise<ReportOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      // ⚠ 子查询里必须写全表名 reports.id。Drizzle 会把它渲染成裸 "id"，
      // 而 citations 自己也有 id 列，条件会变成 c.report_id = c.id（恒假、不报错、
      // 计数静默变成 0）。这个坑在里程碑与执行记录里都踩过。
      citationCount: sql<number>`(select count(*) from citations c where c.report_id = reports.id)::int`,
    })
    .from(reports)
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.updatedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    citationCount: Number(r.citationCount ?? 0),
  }));
}

/** 某份报告（或全部）的来源清单 */
export async function listCitations(userId: string, reportId?: string): Promise<CitationView[]> {
  const db = getDb();

  if (reportId) {
    await assertReportOwned(userId, reportId);
  }

  const rows = await db
    .select({
      id: citations.id,
      reportId: citations.reportId,
      reportTitle: reports.title,
      sourceTitle: citations.sourceTitle,
      sourceUrl: citations.sourceUrl,
      quote: citations.quote,
      dataType: citations.dataType,
      createdAt: citations.createdAt,
    })
    .from(citations)
    .innerJoin(reports, eq(reports.id, citations.reportId))
    .where(reportId ? and(eq(reports.userId, userId), eq(citations.reportId, reportId)) : eq(reports.userId, userId))
    .orderBy(asc(citations.createdAt))
    .limit(reportId ? MAX_CITATIONS_PER_REPORT : 500);

  return rows.map((r) => ({
    id: r.id,
    reportId: r.reportId,
    reportTitle: r.reportTitle,
    sourceTitle: r.sourceTitle,
    sourceUrl: r.sourceUrl,
    quote: r.quote,
    dataType: r.dataType,
    dataTypeLabel: DATA_TYPE_LABEL[r.dataType as keyof typeof DATA_TYPE_LABEL] ?? r.dataType,
    createdAt: iso(r.createdAt),
  }));
}

async function assertReportOwned(userId: string, reportId: string): Promise<void> {
  if (!isUuid(reportId)) {
    // 非法 UUID 也按「不存在」处理：不必告诉对方「你 id 格式错了」，那只是噪音
    throw new AppError("REPORT_NOT_FOUND", "报告不存在，或不属于当前用户", 404);
  }
  const db = getDb();
  const [row] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("REPORT_NOT_FOUND", "报告不存在，或不属于当前用户", 404);
}

export async function createCitation(userId: string, input: CreateCitationInput): Promise<CitationView> {
  await assertReportOwned(userId, input.reportId);

  const db = getDb();
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(citations)
    .where(eq(citations.reportId, input.reportId));

  if (Number(countRow?.n ?? 0) >= MAX_CITATIONS_PER_REPORT) {
    throw new AppError(
      "CITATION_LIMIT_EXCEEDED",
      `每份报告最多登记 ${MAX_CITATIONS_PER_REPORT} 条来源，请先删掉不再引用的条目`,
      409,
    );
  }

  const [row] = await db
    .insert(citations)
    .values({
      reportId: input.reportId,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      quote: input.quote,
      dataType: input.dataType,
    })
    .returning();

  const [report] = await db
    .select({ title: reports.title })
    .from(reports)
    .where(eq(reports.id, input.reportId))
    .limit(1);

  return {
    id: row.id,
    reportId: row.reportId,
    reportTitle: report?.title ?? "",
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    quote: row.quote,
    dataType: row.dataType,
    dataTypeLabel: DATA_TYPE_LABEL[row.dataType as keyof typeof DATA_TYPE_LABEL] ?? row.dataType,
    createdAt: iso(row.createdAt),
  };
}

/**
 * 删除来源。
 * 走 report 联查校验归属：citations 表本身没有 user_id，
 * 直接按 id 删会让任何人删掉别人的来源——这类越权在测试里必须覆盖。
 */
export async function deleteCitation(userId: string, citationId: string): Promise<void> {
  if (!isUuid(citationId)) {
    throw new AppError("CITATION_NOT_FOUND", "来源条目不存在", 404);
  }

  const db = getDb();
  const [row] = await db
    .select({ id: citations.id })
    .from(citations)
    .innerJoin(reports, eq(reports.id, citations.reportId))
    .where(and(eq(citations.id, citationId), eq(reports.userId, userId)))
    .limit(1);

  if (!row) throw new AppError("CITATION_NOT_FOUND", "来源条目不存在，或不属于当前用户", 404);

  await db.delete(citations).where(eq(citations.id, citationId));
}

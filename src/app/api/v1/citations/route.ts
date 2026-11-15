import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { createCitationSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";
import { createCitation, listCitations, listReportOptions } from "@/server/services/citations";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/citations?reportId=xxx — 来源清单（不传 reportId 则为全部）
 * POST /api/v1/citations — 给报告登记一条来源
 *
 * 响应里额外带 reportOptions，是为了让前端一次请求就能渲染「给哪份报告加来源」的下拉，
 * 不必再为下拉单独发一次请求。带 ?reportId 时不返回，减少无谓查询。
 */
export async function GET(request: Request) {
  try {
    const userId = getEnv().APP_USER_ID;
    const reportId = new URL(request.url).searchParams.get("reportId") ?? undefined;
    const citations = await listCitations(userId, reportId);

    if (reportId) return ok({ citations });

    const reportOptions = await listReportOptions(userId);
    return ok({ citations, reportOptions });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = getEnv().APP_USER_ID;
    const input = parseInput(createCitationSchema, await readJson(request));
    const item = await createCitation(userId, input);

    await writeAudit(getDb(), {
      userId,
      action: "create",
      entityType: "citations",
      entityId: item.id,
      permissionLevel: "L1",
      detail: { reportId: input.reportId, sourceTitle: item.sourceTitle, dataType: item.dataType },
    });

    return ok(item, 201);
  } catch (error) {
    return fail(error);
  }
}

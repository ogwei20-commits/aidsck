import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { createRateSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";
import { createRate, listRatePairs, listRates } from "@/server/services/rates";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/rates — 每个货币对的当前有效汇率 + 历史条数
 * POST /api/v1/rates — 手动登记一条汇率（只追加，不覆盖）
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get("history") === "1";

    const pairs = await listRatePairs();
    if (!includeHistory) return ok({ pairs });

    return ok({ pairs, history: await listRates(200) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInput(createRateSchema, await readJson(request));
    const item = await createRate(input);

    await writeAudit(getDb(), {
      userId: getEnv().APP_USER_ID,
      action: "create",
      entityType: "currency_rates",
      entityId: item.id,
      permissionLevel: "L2",
      detail: { pair: `${item.base}/${item.quote}`, rate: item.rate, source: item.source },
    });

    return ok(item, 201);
  } catch (error) {
    return fail(error);
  }
}

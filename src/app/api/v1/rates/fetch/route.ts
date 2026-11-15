import { fail, ok, parseInput, readOptionalJson } from "@/lib/errors/api";
import { fetchRatesSchema } from "@/lib/validation/schemas";
import { fetchAndStoreRates } from "@/server/services/rates";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rates/fetch — 从公开汇率源拉一批并落库
 *
 * 说明清楚三件事：用了哪个源、写进去几条、哪些没写以及为什么。
 * 断网时返回 502 并给出「手动录一条」的下一步，不返回空结果冒充成功。
 */
export async function POST(request: Request) {
  try {
    const input = parseInput(fetchRatesSchema, await readOptionalJson(request));
    const result = await fetchAndStoreRates(input.base, input.targets);
    return ok(result, 200);
  } catch (error) {
    return fail(error);
  }
}

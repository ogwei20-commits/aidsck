import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { searchFiles } from "@/server/services/file-search";

export const dynamic = "force-dynamic";

/** GET /api/v1/files/search?q=关键词 — 文件名 + 已索引正文的全文检索 */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return ok(await searchFiles(getEnv().APP_USER_ID, q));
  } catch (error) {
    return fail(error);
  }
}

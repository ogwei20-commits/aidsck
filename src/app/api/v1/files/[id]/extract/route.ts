import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { clearFileIndex, indexFile } from "@/server/services/file-extract";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * POST   /api/v1/files/:id/extract — 重建该文件的文本索引
 * DELETE /api/v1/files/:id/extract — 清掉索引，回到「未解析」
 */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const result = await indexFile(getEnv().APP_USER_ID, id);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await clearFileIndex(getEnv().APP_USER_ID, id);
    return ok({ fileId: id, status: "pending" });
  } catch (error) {
    return fail(error);
  }
}

import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { indexPendingFiles } from "@/server/services/file-extract";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/files/extract — 批量解析所有「未解析」的文件
 * 单个文件失败不中断整批，返回逐文件结果，界面能说清哪份没成、为什么。
 */
export async function POST() {
  try {
    const result = await indexPendingFiles(getEnv().APP_USER_ID, 20);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

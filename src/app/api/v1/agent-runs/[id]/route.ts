import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok } from "@/lib/errors/api";
import { isUuid } from "@/lib/utils/format";
import { getRunDetail } from "@/server/services/agent-runs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/agent-runs/:id — 单次执行的完整记录。
 *
 * 返回这次执行发给 Agent 的输入、Agent 的产出全文、耗时与 token。
 * 列表在页面侧服务端渲染，只有展开详情才走这个接口——
 * 产出动辄几千字，列表里带全文会让首屏传输量随使用时长线性增长。
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    // 非法 UUID 直接 404：放进 SQL 会变成 22P02 类型错误，暴露的是数据库细节
    if (!isUuid(id)) {
      throw new AppError("RUN_NOT_FOUND", "执行记录不存在", 404);
    }
    return ok(await getRunDetail(getEnv().APP_USER_ID, id));
  } catch (error) {
    return fail(error);
  }
}

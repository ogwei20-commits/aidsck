import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { advanceWorkflowRun } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/workflow-runs/:id/advance — 继续推进到下一个停点。
 * 无 body：推进本身没有参数，风险由状态机控制（重复点击会被 409 挡住）。
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    return ok(await advanceWorkflowRun(getEnv().APP_USER_ID, id));
  } catch (error) {
    return fail(error);
  }
}

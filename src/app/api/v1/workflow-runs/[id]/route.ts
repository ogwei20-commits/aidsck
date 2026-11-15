import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { getWorkflowRun } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/workflow-runs/:id — 读取运行状态（不推进） */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    return ok(await getWorkflowRun(getEnv().APP_USER_ID, id));
  } catch (error) {
    return fail(error);
  }
}

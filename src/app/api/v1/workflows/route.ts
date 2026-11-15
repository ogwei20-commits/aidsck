import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { listWorkflowsWithRuns } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

/** GET /api/v1/workflows — 工作流列表与每条最近一次运行 */
export async function GET() {
  try {
    return ok(await listWorkflowsWithRuns(getEnv().APP_USER_ID));
  } catch (error) {
    return fail(error);
  }
}

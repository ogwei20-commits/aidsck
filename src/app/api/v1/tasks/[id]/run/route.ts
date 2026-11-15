import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readOptionalJson } from "@/lib/errors/api";
import { runTaskSchema } from "@/lib/validation/schemas";
import { executeTask, listTaskRuns } from "@/server/ai/orchestrator/executor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/tasks/:id/run — 请求执行任务（文档 6） */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = parseInput(runTaskSchema, await readOptionalJson(request));
    const result = await executeTask({
      userId: getEnv().APP_USER_ID,
      taskId: id,
      agentSlug: input.agentSlug,
      trigger: "task.run",
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}

/** GET /api/v1/tasks/:id/run — 读取该任务的执行历史 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    return ok(await listTaskRuns(getEnv().APP_USER_ID, id));
  } catch (error) {
    return fail(error);
  }
}

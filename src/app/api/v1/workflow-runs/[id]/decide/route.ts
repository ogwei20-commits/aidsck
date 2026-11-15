import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { decideWorkflowSchema } from "@/lib/validation/schemas";
import { decideWorkflowRun } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/workflow-runs/:id/decide — 对等待人工的节点做决定。
 * approve 会写审计并继续推进；reject 终止本次运行，不删除已有产出。
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = parseInput(decideWorkflowSchema, await readJson(request));
    return ok(await decideWorkflowRun(getEnv().APP_USER_ID, id, input.decision, input.note));
  } catch (error) {
    return fail(error);
  }
}

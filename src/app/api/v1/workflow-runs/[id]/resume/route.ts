import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { resumeWorkflowSchema } from "@/lib/validation/schemas";
import { resumeWorkflowRun } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/workflow-runs/:id/resume — 中断后从失败节点续跑。
 *
 * body: { action: "retry" | "skip", note?: string }
 * - retry：失败原因已修复，重跑这一步；前面已完成的节点不重跑
 * - skip：这一步跑不通，标为未执行后继续；必须写明原因，人工闸门不允许跳过
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = parseInput(resumeWorkflowSchema, await readJson(request));
    return ok(await resumeWorkflowRun(getEnv().APP_USER_ID, id, input.action, input.note));
  } catch (error) {
    return fail(error);
  }
}

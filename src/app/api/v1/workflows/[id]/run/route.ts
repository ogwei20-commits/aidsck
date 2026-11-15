import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok, parseInput, readOptionalJson } from "@/lib/errors/api";
import { startWorkflowSchema } from "@/lib/validation/schemas";
import { startWorkflowRun } from "@/server/ai/workflows/engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/workflows/:id/run — 启动一次运行并推进到第一个停点。
 * id 支持 slug 或数据库 UUID。返回里带完整步骤状态，前端不用再查一次。
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = parseInput(startWorkflowSchema, await readOptionalJson(request));

    let slug = id;
    if (UUID_RE.test(id)) {
      const [row] = await getDb()
        .select({ slug: workflows.slug })
        .from(workflows)
        .where(or(eq(workflows.id, id), eq(workflows.slug, id)))
        .limit(1);
      if (!row) throw new AppError("WORKFLOW_NOT_FOUND", "工作流不存在", 404);
      slug = row.slug;
    }

    const result = await startWorkflowRun(getEnv().APP_USER_ID, slug, {
      goal: input.goal,
      projectId: input.projectId,
      inputs: input.inputs,
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}

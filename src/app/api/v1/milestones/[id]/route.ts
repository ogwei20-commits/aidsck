import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { patchMilestoneSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";
import { deleteMilestone, patchMilestone } from "@/server/services/milestones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/v1/milestones/:id — body: { done?: boolean, title?: string }
 * DELETE /api/v1/milestones/:id — 里程碑无外部副作用，不走审批（理由见服务层注释）
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = getEnv().APP_USER_ID;
    const { id } = await params;
    const input = parseInput(patchMilestoneSchema, await readJson(request));
    // done 缺省时按「不改完成状态」处理：只改标题不能顺手把已完成改回未完成
    const item = await patchMilestone(userId, id, { done: input.done, title: input.title });

    await writeAudit(getDb(), {
      userId,
      action: "update",
      entityType: "project_milestones",
      entityId: id,
      permissionLevel: "L2",
      detail: { done: input.done, title: input.title },
    });

    return ok(item);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const userId = getEnv().APP_USER_ID;
    const { id } = await params;
    await deleteMilestone(userId, id);

    await writeAudit(getDb(), {
      userId,
      action: "delete",
      entityType: "project_milestones",
      entityId: id,
      permissionLevel: "L2",
      detail: {},
    });

    return ok({ id });
  } catch (error) {
    return fail(error);
  }
}

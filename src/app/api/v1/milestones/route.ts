import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { createMilestoneSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";
import { createMilestone, listMilestones } from "@/server/services/milestones";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/milestones — 按项目分组的里程碑（含完成数）
 * POST /api/v1/milestones — 新建一条，body: { projectId, title, dueAt? }
 */
export async function GET() {
  try {
    return ok(await listMilestones(getEnv().APP_USER_ID));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = getEnv().APP_USER_ID;
    const input = parseInput(createMilestoneSchema, await readJson(request));
    const item = await createMilestone(userId, input);

    await writeAudit(getDb(), {
      userId,
      action: "create",
      entityType: "project_milestones",
      entityId: item.id,
      permissionLevel: "L2",
      detail: { projectId: input.projectId, title: item.title, dueAt: item.dueAt },
    });

    return ok(item, 201);
  } catch (error) {
    return fail(error);
  }
}

import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { writeAudit } from "@/server/audit/logger";
import { deleteCitation } from "@/server/services/citations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/citations/:id — 删除一条来源
 *
 * 不走审批：来源条目是报告的附属记录，删掉只影响这份报告自己的附录，
 * 没有外部副作用（对比：删除项目会级联删任务，那类才需要闸门）。
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const userId = getEnv().APP_USER_ID;
    const { id } = await params;
    await deleteCitation(userId, id);

    await writeAudit(getDb(), {
      userId,
      action: "delete",
      entityType: "citations",
      entityId: id,
      permissionLevel: "L1",
      detail: {},
    });

    return ok({ id });
  } catch (error) {
    return fail(error);
  }
}

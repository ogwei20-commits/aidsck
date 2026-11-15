import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok, readJson } from "@/lib/errors/api";
import { getModule } from "@/modules/registry";
import { deleteRow, getRow, updateRow, type Row } from "@/modules/store";
import { writeAudit } from "@/server/audit/logger";
import { requireApproval } from "@/server/permissions/policy";
import type { ModuleDef } from "@/modules/types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ module: string; id: string }>;
}

function resolve(slug: string): ModuleDef {
  const def = getModule(slug);
  if (!def) throw new AppError("MODULE_NOT_FOUND", `模块 ${slug} 不存在`, 404);
  return def;
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { module, id } = await ctx.params;
    const def = resolve(module);
    const row = await getRow(def, getEnv().APP_USER_ID, id);
    if (!row) throw new AppError("NOT_FOUND", "未找到这条记录", 404);
    return ok(row);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { module, id } = await ctx.params;
    const def = resolve(module);
    const userId = getEnv().APP_USER_ID;
    const input = (await readJson(request)) as Row;

    const row = await updateRow(def, userId, id, input);
    if (!row) throw new AppError("NOT_FOUND", "未找到这条记录", 404);

    await writeAudit(getDb(), {
      userId,
      action: "update",
      entityType: def.table,
      entityId: id,
      permissionLevel: "L2",
      detail: { module: def.slug, columns: Object.keys(input) },
    });
    return ok(row);
  } catch (error) {
    return fail(error);
  }
}

/**
 * 删除是 L3 操作：必须先有 approved 的审批记录，否则 403 并说明如何解锁。
 * 这是文档 4.4-4「删除数据前必须有保护机制」与 9.1 权限分级的落地。
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { module, id } = await ctx.params;
    const def = resolve(module);
    const userId = getEnv().APP_USER_ID;

    await requireApproval(getDb(), "archive", def.table, id, "L3");

    const deleted = await deleteRow(def, userId, id);
    if (!deleted) throw new AppError("NOT_FOUND", "未找到这条记录", 404);

    await writeAudit(getDb(), {
      userId,
      action: "archive",
      entityType: def.table,
      entityId: id,
      permissionLevel: "L3",
      detail: { module: def.slug },
    });
    return ok({ id, deleted: true });
  } catch (error) {
    return fail(error);
  }
}

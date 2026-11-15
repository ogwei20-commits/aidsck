import { getDb } from "@/db";
import { AppError, fail, ok, readJson } from "@/lib/errors/api";
import { getEnv } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { createRow, listRows, missingRequired, type Row } from "@/modules/store";
import { writeAudit } from "@/server/audit/logger";
import type { ModuleDef } from "@/modules/types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ module: string }>;
}

/** 统一解析模块，未知 slug 一律 404，不做兜底猜测 */
function resolve(slug: string): ModuleDef {
  const def = getModule(slug);
  if (!def) throw new AppError("MODULE_NOT_FOUND", `模块 ${slug} 不存在`, 404);
  return def;
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const def = resolve((await ctx.params).module);
    if (def.scope === "global") {
      // system_settings 是全局表，仍按同一接口读取
      return ok(await listRows(def, getEnv().APP_USER_ID));
    }
    return ok(await listRows(def, getEnv().APP_USER_ID));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const def = resolve((await ctx.params).module);
    const userId = getEnv().APP_USER_ID;
    const input = (await readJson(request)) as Row;

    const missing = missingRequired(def, input);
    if (missing.length > 0) {
      throw new AppError("VALIDATION_FAILED", "输入校验未通过", 422, {
        fields: missing.map((label) => ({ field: label, message: "此项必填" })),
      });
    }

    const row = await createRow(def, userId, input);
    await writeAudit(getDb(), {
      userId,
      action: "create",
      entityType: def.table,
      entityId: String(row.id),
      permissionLevel: "L2",
      detail: { module: def.slug, title: String(row[def.titleField] ?? "") },
    });
    return ok(row, 201);
  } catch (error) {
    return fail(error);
  }
}

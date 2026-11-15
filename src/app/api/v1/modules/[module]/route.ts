import { getDb } from "@/db";
import { AppError, fail, ok, readJson } from "@/lib/errors/api";
import { getEnv } from "@/lib/config/env";
import { getModule } from "@/modules/registry";
import { createRow, listRows, listRowsPaged, missingRequired, type Row } from "@/modules/store";
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

export async function GET(request: Request, ctx: Ctx) {
  try {
    const def = resolve((await ctx.params).module);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const userId = getEnv().APP_USER_ID;

    // 带关键词时走同一套 LIKE 逻辑（与页面搜索共用，避免两处口径不一致）。
    // 响应形状仍是数组：接口的既有消费方按数组解析，不能因为加分页就改形状。
    if (q) {
      const paged = await listRowsPaged(def, userId, { q, pageSize: 50 });
      return ok(paged.rows);
    }

    // system_settings 是全局表，也走同一接口：listRows 内部按 scope 决定过滤条件
    return ok(await listRows(def, userId));
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

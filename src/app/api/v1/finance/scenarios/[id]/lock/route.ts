import { getDb } from "@/db";
import { getEnv } from "@/lib/config/env";
import { fail, ok } from "@/lib/errors/api";
import { writeAudit } from "@/server/audit/logger";
import { lockScenarioFx, unlockScenarioFx } from "@/server/services/rates";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * POST   /api/v1/finance/scenarios/:id/lock — 把当前汇率锁定到方案
 * DELETE /api/v1/finance/scenarios/:id/lock — 解除锁定，回到「按当前汇率试算」
 */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    const userId = getEnv().APP_USER_ID;
    const { id } = await ctx.params;
    const result = await lockScenarioFx(userId, id);

    await writeAudit(getDb(), {
      userId,
      action: "update",
      entityType: "finance_scenarios",
      entityId: id,
      permissionLevel: "L2",
      detail: { lockedFx: `${result.costCurrency}/${result.currency}`, rate: result.rate },
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const userId = getEnv().APP_USER_ID;
    const { id } = await ctx.params;
    await unlockScenarioFx(userId, id);
    return ok({ scenarioId: id, locked: false });
  } catch (error) {
    return fail(error);
  }
}

import { getDb } from "@/db";
import { agentMessages, tasks } from "@/db/schema";
import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok, readJson } from "@/lib/errors/api";
import { getProviderStatus } from "@/server/ai/providers";
import { planTarget } from "@/server/ai/orchestrator/planner";
import { writeAudit } from "@/server/audit/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getProviderStatus();
  return ok({ provider: status });
}

/**
 * 把一句目标拆成任务并真实写库。
 *
 * 当前是规则模板拆解（不是模型推理），因此响应里 mode 固定为 rule-template，
 * 前端必须据此标注来源，避免被当成 AI 输出。
 */
export async function POST(request: Request) {
  try {
    const userId = getEnv().APP_USER_ID;
    const body = (await readJson(request)) as { target?: unknown; projectId?: unknown };
    const target = String(body.target ?? "").trim();

    if (target.length < 4) {
      throw new AppError("VALIDATION_FAILED", "请把目标写具体一点，至少 4 个字", 422, {
        fields: [{ field: "target", message: "太短，系统无法拆解" }],
      });
    }
    if (target.length > 500) {
      throw new AppError("VALIDATION_FAILED", "目标请控制在 500 字以内", 422);
    }

    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
    const plan = planTarget(target);
    const db = getDb();

    const inserted = await db
      .insert(tasks)
      .values(
        plan.steps.map((step) => ({
          userId,
          projectId,
          title: step.title,
          detail: step.detail,
          priority: step.priority,
          source: "assistant",
          agentSlug: step.manual ? null : step.agentSlug,
          dataType: "U" as const,
        })),
      )
      .returning({ id: tasks.id, title: tasks.title });

    await db.insert(agentMessages).values([
      { conversationId: null, agentId: null, role: "user", content: target },
      {
        conversationId: null,
        agentId: null,
        role: "assistant",
        content: `[规则模板拆解 · 非模型输出] 拆出 ${plan.steps.length} 个任务：${plan.steps
          .map((s) => s.title)
          .join("；")}`,
      },
    ]);

    await writeAudit(db, {
      userId,
      action: "run",
      entityType: "assistant",
      entityId: null,
      permissionLevel: "L2",
      detail: { target, steps: plan.steps.length, mode: plan.mode },
    });

    return ok({ plan, created: inserted }, 201);
  } catch (error) {
    return fail(error);
  }
}

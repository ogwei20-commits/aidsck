import { getDb } from "@/db";
import { agentMessages, tasks } from "@/db/schema";
import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok, readJson } from "@/lib/errors/api";
import { getProviderStatus } from "@/server/ai/providers";
import { dispatchPlan } from "@/server/ai/orchestrator/dispatcher";
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
 * `dispatch: true` 时继续做第二步：把有 Agent 的任务真的派出去执行，
 * 返回每条任务的执行结果。这是 PRD US-07「自动拆解并调度」的实现。
 *
 * 当前拆解是规则模板（不是模型推理），因此响应里 mode 固定为 rule-template，
 * 前端必须据此标注来源，避免被当成 AI 输出。
 */
export async function POST(request: Request) {
  try {
    const userId = getEnv().APP_USER_ID;
    const body = (await readJson(request)) as {
      target?: unknown;
      projectId?: unknown;
      dispatch?: unknown;
    };
    const target = String(body.target ?? "").trim();
    const shouldDispatch = body.dispatch === true;

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

    const dispatch = shouldDispatch ? await dispatchPlan(userId, plan.steps, inserted) : null;

    await db.insert(agentMessages).values([
      { conversationId: null, agentId: null, role: "user", content: target },
      {
        conversationId: null,
        agentId: null,
        role: "assistant",
        content:
          `[规则模板拆解 · 非模型输出] 拆出 ${plan.steps.length} 个任务：${plan.steps
            .map((s) => s.title)
            .join("；")}` +
          (dispatch
            ? `；已派发 ${dispatch.succeeded + dispatch.failed} 条，成功 ${dispatch.succeeded} 条、失败 ${dispatch.failed} 条、需人工 ${dispatch.skipped} 条。`
            : "。任务已创建，尚未派发。"),
      },
    ]);

    await writeAudit(db, {
      userId,
      action: "run",
      entityType: "assistant",
      entityId: null,
      permissionLevel: "L2",
      detail: {
        target,
        steps: plan.steps.length,
        mode: plan.mode,
        dispatched: dispatch ? { succeeded: dispatch.succeeded, failed: dispatch.failed, skipped: dispatch.skipped } : null,
      },
    });

    return ok({ plan, created: inserted, dispatch }, 201);
  } catch (error) {
    return fail(error);
  }
}

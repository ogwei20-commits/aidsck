import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok, parseInput, readOptionalJson } from "@/lib/errors/api";
import { runAgentSchema } from "@/lib/validation/schemas";
import { executeTask } from "@/server/ai/orchestrator/executor";
import { createTask } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/agents/:id/run — 请求指定 Agent 执行（文档 6）
 * id 支持 slug（如 market-analyst）或数据库 UUID。
 * 传 target 而未传 taskId 时，先创建任务再执行，保证「每次执行都有任务可追溯」。
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = parseInput(runAgentSchema, await readOptionalJson(request));
    const userId = getEnv().APP_USER_ID;
    const db = getDb();

    const [agent] = await db
      .select()
      .from(agents)
      .where(UUID_RE.test(id) ? or(eq(agents.id, id), eq(agents.slug, id)) : eq(agents.slug, id))
      .limit(1);

    if (!agent) {
      throw new AppError("AGENT_NOT_FOUND", `未找到 Agent「${id}」，请到 Agent 中心查看可用列表`, 404);
    }

    let taskId = input.taskId;
    let createdTask = false;

    if (!taskId) {
      const task = await createTask(userId, {
        title: (input.target ?? "").slice(0, 200),
        priority: 2,
        source: "assistant",
        dataType: "U",
      });
      taskId = task.id;
      createdTask = true;
    }

    const result = await executeTask({
      userId,
      taskId,
      agentSlug: agent.slug,
      trigger: createdTask ? "agent.run.new-task" : "agent.run",
    });

    return ok({ ...result, createdTask }, 201);
  } catch (error) {
    return fail(error);
  }
}

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { agentMessages, agentRuns, auditLogs, taskLogs, tasks } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { executeTask, listTaskRuns } from "@/server/ai/orchestrator/executor";
import { createTask, ensureLocalUser } from "@/server/services/workspace";

const uid = DEFAULT_USER_ID;
const createdTaskIds: string[] = [];

async function newTask(title: string) {
  const task = await createTask(uid, { title, priority: 2, source: "user", dataType: "U" });
  createdTaskIds.push(task.id);
  return task;
}

describe("Agent 执行引擎（F-08 / F-10）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdTaskIds.length > 0) {
      await db.delete(agentRuns).where(inArray(agentRuns.taskId, createdTaskIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdTaskIds));
      await db.delete(tasks).where(inArray(tasks.id, createdTaskIds));
    }
    await closeDb();
  });

  it("执行任务后四张表都有真实记录，任务进入待审核而不是直接完成", async () => {
    const task = await newTask("[测试] 执行引擎基础链路");
    const result = await executeTask({ userId: uid, taskId: task.id, trigger: "test" });

    expect(result.mode).toBe("framework");
    expect(result.isRealAI).toBe(false);
    expect(result.hasConclusion).toBe(false);
    expect(result.quality.pass).toBe(true);
    expect(result.taskStatus).toBe("review");

    const db = getDb();
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.taskId, task.id));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
    expect(runs[0].startedAt).not.toBeNull();
    expect(runs[0].finishedAt).not.toBeNull();

    const messages = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.runId, result.runId));
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.role).sort()).toEqual(["assistant", "user"]);

    const logs = await db.select().from(taskLogs).where(eq(taskLogs.taskId, task.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].durationMs).not.toBeNull();

    const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(after.status).toBe("review");
    expect(after.agentSlug).toBe("supervisor");
  });

  it("执行历史可按任务查回，且带 Agent 名称", async () => {
    const task = await newTask("[测试] 执行历史查询");
    await executeTask({ userId: uid, taskId: task.id, agentSlug: "market-analyst", trigger: "test" });

    const history = await listTaskRuns(uid, task.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].agentName).toBe("Market Analyst");
    expect(history[0].status).toBe("succeeded");
  });

  it("达到执行次数上限后拒绝继续执行", async () => {
    const task = await newTask("[测试] 执行上限");
    // 默认上限 3 次，跑满
    for (let i = 0; i < 3; i += 1) {
      await executeTask({ userId: uid, taskId: task.id, agentSlug: "finance-analyst", trigger: "test" });
    }
    await expect(
      executeTask({ userId: uid, taskId: task.id, agentSlug: "finance-analyst", trigger: "test" }),
    ).rejects.toMatchObject({ code: "RUN_LIMIT_EXCEEDED" });
  }, 30000);

  it("任务不存在时明确报 404，不静默创建", async () => {
    await expect(
      executeTask({
        userId: uid,
        taskId: "00000000-0000-0000-0000-0000000000ff",
        trigger: "test",
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("Agent 不存在时明确报 404", async () => {
    const task = await newTask("[测试] 未知 Agent");
    await expect(
      executeTask({ userId: uid, taskId: task.id, agentSlug: "ghost-agent", trigger: "test" }),
    ).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });
  });

  it("执行失败不会把任务留在 running 状态", async () => {
    const task = await newTask("[测试] 失败回滚");
    await expect(
      executeTask({ userId: uid, taskId: task.id, agentSlug: "ghost-agent", trigger: "test" }),
    ).rejects.toThrow();

    const db = getDb();
    const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    // 未找到 Agent 时在执行前就拒绝，任务应保持原状而不是卡在 running
    expect(after.status).toBe("pending");
  });

  it("L2 权限的 Agent 能执行分析动作（权限是累加而非互斥）", async () => {
    const task = await newTask("[测试] L2 执行");
    const result = await executeTask({
      userId: uid,
      taskId: task.id,
      agentSlug: "finance-analyst",
      trigger: "test",
    });
    expect(result.agentSlug).toBe("finance-analyst");
    expect(result.quality.pass).toBe(true);
  });
});

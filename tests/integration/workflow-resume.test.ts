import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import {
  agentMessages,
  agentRuns,
  agents,
  auditLogs,
  knowledgeItems,
  projects,
  reports,
  taskLogs,
  tasks,
  workflowRuns,
  workflows,
} from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { resumeWorkflowRun, startWorkflowRun } from "@/server/ai/workflows/engine";
import { MAX_RETRY_ATTEMPTS } from "@/server/ai/workflows/resume";
import { ensureLocalUser } from "@/server/services/workspace";

/**
 * 续跑集成测试：全部走真数据库、真执行引擎。
 *
 * 失败不是伪造的——这里把某个 Agent 停用，让执行真的失败，
 * 再把 Agent 启用回来重试。这条路径正是用户真实会遇到的：
 * 「某个环节跑不通了，修好之后能不能接着跑，而不是从头再来一遍」。
 */

const uid = DEFAULT_USER_ID;
const SLUG = "resume-test-flow";
const AGENT_SLUG = "product-researcher";

const createdRuns: string[] = [];
const createdProjects: string[] = [];
const createdKnowledge: string[] = [];

let originalAgentStatus = "ready";

const DEFINITION = {
  version: 1,
  deliverable: "续跑测试：准备 → 研究 → 归档",
  steps: [
    { id: "r1", title: "准备载体", kind: "start", description: "建一个项目承载产出" },
    {
      id: "r2",
      title: "执行研究",
      kind: "agent",
      description: "交给产品研究员执行",
      agentSlug: AGENT_SLUG,
    },
    { id: "r3", title: "归档", kind: "archive", description: "把产出存入知识库" },
  ],
};

async function seedWorkflow() {
  const db = getDb();
  await db
    .insert(workflows)
    .values({
      slug: SLUG,
      name: "续跑测试流程",
      description: "仅用于集成测试",
      definition: DEFINITION as unknown as Record<string, unknown>,
      enabled: "true",
      dataType: "U",
    })
    .onConflictDoUpdate({ target: workflows.slug, set: { definition: DEFINITION as unknown as Record<string, unknown> } });
}

async function setAgentStatus(status: string) {
  await getDb().update(agents).set({ status }).where(eq(agents.slug, AGENT_SLUG));
}

/** 起一条会失败的运行：Agent 停用 → r2 执行失败 */
async function startFailingRun(goal: string) {
  await setAgentStatus("disabled");
  const run = await startWorkflowRun(uid, SLUG, { goal });
  createdRuns.push(run.runId);
  if (run.context.projectId) createdProjects.push(run.context.projectId);
  return run;
}

describe("中断后的续跑", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
    await seedWorkflow();

    const [agent] = await getDb().select({ status: agents.status }).from(agents).where(eq(agents.slug, AGENT_SLUG));
    originalAgentStatus = agent?.status ?? "ready";
  });

  afterAll(async () => {
    const db = getDb();

    await setAgentStatus(originalAgentStatus);

    const taskRows = createdProjects.length
      ? await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.projectId, createdProjects))
      : [];
    const taskIds = taskRows.map((t) => t.id);

    if (taskIds.length > 0) {
      const runRows = await db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.taskId, taskIds));
      const agentRunIds = runRows.map((r) => r.id);
      if (agentRunIds.length > 0) {
        await db.delete(agentMessages).where(inArray(agentMessages.runId, agentRunIds));
      }
      await db.delete(agentRuns).where(inArray(agentRuns.taskId, taskIds));
      await db.delete(taskLogs).where(inArray(taskLogs.taskId, taskIds));
      await db.delete(tasks).where(inArray(tasks.id, taskIds));
    }

    if (createdRuns.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdRuns));
      await db.delete(workflowRuns).where(inArray(workflowRuns.id, createdRuns));
    }
    if (createdKnowledge.length > 0) {
      await db.delete(knowledgeItems).where(inArray(knowledgeItems.id, createdKnowledge));
    }
    for (const pid of createdProjects) {
      await db.delete(reports).where(eq(reports.projectId, pid));
    }
    if (createdProjects.length > 0) {
      await db.delete(projects).where(inArray(projects.id, createdProjects));
    }
    await db.delete(workflows).where(eq(workflows.slug, SLUG));

    await closeDb();
  });

  it("Agent 停用时，运行真的停在失败的节点上，并留下可读的原因", async () => {
    const run = await startFailingRun("家用收纳盒在美国站的可行性");

    expect(run.status).toBe("failed");
    expect(run.currentNode).toBe("r2");
    expect(run.context.steps.r1.status).toBe("succeeded");
    expect(run.context.steps.r1.recordId).toBeTruthy();
    expect(run.context.steps.r2.status).toBe("failed");
    expect(run.context.steps.r2.note).toContain("不可执行");
    expect(run.context.steps.r3.status).toBe("pending");
    // 失败节点的任务已经建出来了，id 必须留下，否则续跑会再建一条同名任务
    expect(run.context.steps.r2.taskId).toBeTruthy();
  });

  it("已结束的运行不能续跑，只有中断的才可以", async () => {
    const run = await startFailingRun("第二条件下验证");
    await setAgentStatus(originalAgentStatus);

    const done = await resumeWorkflowRun(uid, run.runId, "retry");
    expect(done.status).toBe("succeeded");

    await expect(resumeWorkflowRun(uid, run.runId, "retry")).rejects.toThrow(/只有中断/);
  });

  it("修好原因后重试：只重跑失败节点，前面的节点一个都不重跑", async () => {
    const failed = await startFailingRun("厨房小工具在美国站的可行性");
    expect(failed.status).toBe("failed");

    const r1Before = failed.context.steps.r1.recordId!;
    const r2TaskId = failed.context.steps.r2.taskId!;
    const r2RunIdBefore = failed.context.steps.r2.runId;

    // 修好：把 Agent 重新启用
    await setAgentStatus(originalAgentStatus);

    const resumed = await resumeWorkflowRun(uid, failed.runId, "retry", "Agent 已重新启用");
    expect(resumed.status).toBe("succeeded");

    // r1 没有被重跑：项目还是原来那个
    expect(resumed.context.steps.r1.recordId).toBe(r1Before);
    // r2 真的重跑了：同一条任务、新的执行记录
    expect(resumed.context.steps.r2.taskId).toBe(r2TaskId);
    expect(r2RunIdBefore).toBeUndefined(); // 失败那次没有留下执行记录
    expect(resumed.context.steps.r2.runId).toBeTruthy();
    expect(resumed.context.steps.r2.attempts).toBe(2);
    expect(resumed.context.steps.r2.lastError?.message).toContain("不可执行");

    // 任务没有重复：这一步只有一条任务
    const db = getDb();
    const sameTitle = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, resumed.context.projectId!));
    expect(sameTitle.filter((t) => t.id === r2TaskId)).toHaveLength(1);
    expect(sameTitle).toHaveLength(1);

    // 失败那次卡在准入检查（Agent 停用），根本没跑起来，所以没有执行记录；
    // 续跑后这条任务下应当只有一条 really-executed 的记录。
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.taskId, r2TaskId));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");

    // 「这一步被重试过」写在任务详情里，任务页能直接看出来
    const [task] = await db.select().from(tasks).where(eq(tasks.id, r2TaskId));
    expect(task.detail).toContain("第 2 次执行");

    expect(resumed.context.resumes).toHaveLength(1);
    expect(resumed.context.resumes?.[0]).toMatchObject({ stepId: "r2", action: "retry", attempt: 2 });

    if (resumed.context.steps.r3.recordId) createdKnowledge.push(resumed.context.steps.r3.recordId);
  });

  it("一直修不好时会停下，不让人无限重试", async () => {
    const run = await startFailingRun("反复失败的场景");
    expect(run.status).toBe("failed");

    // Agent 一直停用：每次重试都失败，attempts 逐次累加
    let attempts = 1;
    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i += 1) {
      const again = await resumeWorkflowRun(uid, run.runId, "retry");
      expect(again.status).toBe("failed");
      attempts += 1;
      expect(again.context.steps.r2.attempts).toBe(attempts);
    }

    await expect(resumeWorkflowRun(uid, run.runId, "retry")).rejects.toThrow(/已经重试/);
  });

  it("跳过跑不通的节点：标为未执行并写清原因，后面的节点照常走完", async () => {
    const run = await startFailingRun("跳过场景");
    expect(run.status).toBe("failed");

    const skipped = await resumeWorkflowRun(uid, run.runId, "skip", "这个 Agent 第一阶段不启用");
    expect(skipped.status).toBe("succeeded");
    expect(skipped.context.steps.r2.status).toBe("skipped");
    expect(skipped.context.steps.r2.reason).toContain("人工跳过：这个 Agent 第一阶段不启用");
    expect(skipped.context.steps.r2.reason).toContain("原失败");
    expect(skipped.context.steps.r3.status).toBe("succeeded");

    if (skipped.context.steps.r3.recordId) createdKnowledge.push(skipped.context.steps.r3.recordId);
  });

  it("跳过必须写原因：不写就不让过", async () => {
    const run = await startFailingRun("跳过不写原因");
    await expect(resumeWorkflowRun(uid, run.runId, "skip", "")).rejects.toThrow(/写明原因/);
    await expect(resumeWorkflowRun(uid, run.runId, "skip", "算了")).rejects.toThrow(/写明原因/);
  });

  it("流程定义被改过就拒绝续跑——错位执行比不执行更糟", async () => {
    const run = await startFailingRun("定义改动的场景");
    expect(run.status).toBe("failed");

    const db = getDb();
    const changed = {
      ...DEFINITION,
      steps: [DEFINITION.steps[0], DEFINITION.steps[1]],
    };
    await db
      .update(workflows)
      .set({ definition: changed as unknown as Record<string, unknown> })
      .where(eq(workflows.slug, SLUG));

    await expect(resumeWorkflowRun(uid, run.runId, "retry")).rejects.toThrow(/定义被改过/);

    // 定义恢复后，同一条运行仍然可以续跑（拒绝没有破坏状态）
    await db
      .update(workflows)
      .set({ definition: DEFINITION as unknown as Record<string, unknown> })
      .where(eq(workflows.slug, SLUG));
    await setAgentStatus(originalAgentStatus);
    const resumed = await resumeWorkflowRun(uid, run.runId, "retry");
    expect(resumed.status).toBe("succeeded");
    if (resumed.context.steps.r3.recordId) createdKnowledge.push(resumed.context.steps.r3.recordId);
  });
});

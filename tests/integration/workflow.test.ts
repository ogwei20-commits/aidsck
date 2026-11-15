import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import {
  agentMessages,
  agentRuns,
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
import { BUILTIN_WORKFLOWS } from "@/server/ai/workflows/definitions";
import {
  advanceWorkflowRun,
  decideWorkflowRun,
  getWorkflowRun,
  startWorkflowRun,
} from "@/server/ai/workflows/engine";
import { ensureLocalUser } from "@/server/services/workspace";
import type { AdvanceResult } from "@/server/ai/workflows/types";

/**
 * 工作流引擎集成测试：全部走真数据库。
 * 断言重点不是「跑通了」，而是「停在对的地方」——
 * 人工闸门没批就不许往下走，这是这套引擎唯一不能出错的地方。
 */

const uid = DEFAULT_USER_ID;
const createdRuns: string[] = [];
const createdProjects: string[] = [];
const createdKnowledge: string[] = [];

let mainRun: AdvanceResult | null = null;
let emptyRun: AdvanceResult | null = null;

async function seedBuiltinWorkflows() {
  const db = getDb();
  for (const wf of BUILTIN_WORKFLOWS) {
    const definition = wf.definition as unknown as Record<string, unknown>;
    await db
      .insert(workflows)
      .values({
        slug: wf.slug,
        name: wf.name,
        description: wf.description,
        definition,
        enabled: "true",
        dataType: "U",
      })
      .onConflictDoUpdate({ target: workflows.slug, set: { definition } });
  }
}

describe("工作流执行引擎（节点 1–15）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
    await seedBuiltinWorkflows();

    mainRun = await startWorkflowRun(uid, "product-feasibility", {
      goal: "3 个月内用 2 万元验证家居类目在亚马逊美国站的可行性",
    });
    createdRuns.push(mainRun.runId);
    if (mainRun.context.projectId) createdProjects.push(mainRun.context.projectId);
  });

  afterAll(async () => {
    const db = getDb();

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

    await closeDb();
  });

  it("主流程跑到人工闸门就停：前 12 步真实执行，2 个节点标记未执行", () => {
    const result = mainRun!;
    expect(result).toBeTruthy();
    expect(result.needsHuman).toBe(true);
    expect(result.currentNode).toBe("s13");
    expect(result.status).toBe("queued");

    const steps = result.context.steps;
    expect(steps.s1.status).toBe("succeeded");
    expect(result.context.projectId).toBeTruthy();
    expect(steps.s2.status).toBe("succeeded");
    expect(steps.s2.output).toContain("家居类目");

    for (const id of ["s3", "s4", "s5", "s6", "s7"]) {
      expect(steps[id].status).toBe("succeeded");
      expect(steps[id].mode).toBe("framework");
      expect(steps[id].runId).toBeTruthy();
      expect(steps[id].taskId).toBeTruthy();
    }

    expect(steps.s8.status).toBe("skipped");
    expect(steps.s8.reason).toContain("第二阶段");

    expect(steps.s9.status).toBe("succeeded");
    expect(steps.s9.output).toContain("不含新的分析或结论");

    expect(steps.s10.status).toBe("succeeded");
    expect(steps.s10.issues?.length ?? 0).toBeGreaterThan(0);

    expect(steps.s12.status).toBe("succeeded");
    expect(result.context.reportId).toBeTruthy();
    expect(steps.s13.status).toBe("waiting");

    expect(steps.s14.status).toBe("pending");
    expect(steps.s15.status).toBe("pending");
  });

  it("报告正文明确写出「尚无经人工确认的结论」，不冒充研究结论", async () => {
    const reportId = mainRun!.context.reportId!;
    const [report] = await getDb().select().from(reports).where(eq(reports.id, reportId));
    expect(report.body).toContain("尚无经人工确认的研究结论");
    expect(report.body).toContain("不是研究结论");
    expect(report.projectId).toBe(mainRun!.context.projectId);
    expect(report.status).toBe("draft");

    const s4TaskId = mainRun!.context.steps.s4.taskId!;
    const runs = await getDb().select().from(agentRuns).where(eq(agentRuns.taskId, s4TaskId));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
  });

  it("闸门未批准时，推进请求不会绕过它", async () => {
    const result = await advanceWorkflowRun(uid, mainRun!.runId);
    expect(result.needsHuman).toBe(true);
    expect(result.executed).toHaveLength(0);
    expect(result.currentNode).toBe("s13");
  });

  it("批准闸门后跑完剩余节点，节点任务一并标记完成", async () => {
    const result = await decideWorkflowRun(uid, mainRun!.runId, "approve", "报告可采纳，进入归档");
    expect(result.status).toBe("succeeded");
    expect(result.context.steps.s13.decision).toBe("approve");
    expect(result.context.steps.s14.status).toBe("succeeded");
    expect(result.context.steps.s14.recordId).toBeTruthy();
    expect(result.context.steps.s15.status).toBe("skipped");

    createdKnowledge.push(result.context.steps.s14.recordId!);

    const db = getDb();
    const taskIds = Object.values(result.context.steps)
      .map((s) => s.taskId)
      .filter((id): id is string => Boolean(id));
    expect(taskIds.length).toBeGreaterThanOrEqual(5);
    const rows = await db.select().from(tasks).where(inArray(tasks.id, taskIds));
    expect(rows.every((t) => t.status === "done")).toBe(true);

    const [item] = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, result.context.steps.s14.recordId!));
    expect(item.category).toBe("工作流产出");
    expect(item.body).toContain("研究报告");
  });

  it("已结束的运行不能再推进，也不能再决策", async () => {
    await expect(advanceWorkflowRun(uid, mainRun!.runId)).rejects.toThrow(/已结束/);
    await expect(decideWorkflowRun(uid, mainRun!.runId, "approve")).rejects.toThrow(/已结束/);
  });

  it("没有目标时停在人工节点，不猜用户想做什么", async () => {
    emptyRun = await startWorkflowRun(uid, "weekly-review");
    createdRuns.push(emptyRun.runId);
    if (emptyRun.context.projectId) createdProjects.push(emptyRun.context.projectId);

    expect(emptyRun.needsHuman).toBe(true);
    expect(emptyRun.currentNode).toBe("s2");
    expect(emptyRun.context.steps.s2.status).toBe("waiting");
    expect(emptyRun.humanAction).toContain("请填写");
  });

  it("没有报告节点的流程，归档退回到产出汇总而不是失败", async () => {
    const started = await startWorkflowRun(uid, "product-selection", {
      goal: "3 个家居类目候选品的单件净利验证",
    });
    createdRuns.push(started.runId);
    if (started.context.projectId) createdProjects.push(started.context.projectId);

    expect(started.currentNode).toBe("s5");
    expect(started.context.steps.s3.mode).toBe("framework");

    const done = await decideWorkflowRun(uid, started.runId, "approve", "同意进入下一轮打样");
    expect(done.status).toBe("succeeded");
    expect(done.context.steps.s6.status).toBe("succeeded");

    createdKnowledge.push(done.context.steps.s6.recordId!);
    const [item] = await getDb()
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, done.context.steps.s6.recordId!));
    expect(item.body).toContain("不含新的分析或结论");
    expect(item.body).toContain("没有报告节点");
  });

  it("驳回会终止运行，但不删除已经产生的产出", async () => {
    const result = await decideWorkflowRun(uid, emptyRun!.runId, "reject", "目标还没想清楚，先不跑");
    expect(result.status).toBe("cancelled");
    expect(result.context.steps.s2.decision).toBe("reject");

    const [project] = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.id, result.context.projectId!));
    expect(project).toBeTruthy();
  });

  it("读取运行状态不会推进流程", async () => {
    const before = await getWorkflowRun(uid, emptyRun!.runId);
    const after = await getWorkflowRun(uid, emptyRun!.runId);
    expect(before.status).toBe("cancelled");
    expect(after.status).toBe("cancelled");
    expect(after.executed).toHaveLength(0);
  });

  it("定义不合法的流程直接拒绝启动，不执行半个流程", async () => {
    const db = getDb();
    const broken = { version: 1, steps: [{ id: "s1", title: "缺类型" }] } as unknown as Record<string, unknown>;
    await db
      .insert(workflows)
      .values({
        slug: "broken-definition",
        name: "坏定义流程",
        description: "测试用",
        definition: broken,
        enabled: "true",
        dataType: "U",
      })
      .onConflictDoUpdate({ target: workflows.slug, set: { definition: broken } });

    await expect(startWorkflowRun(uid, "broken-definition", { goal: "随便" })).rejects.toThrow(
      /定义不合法/,
    );
    await db.delete(workflows).where(eq(workflows.slug, "broken-definition"));
  });
});

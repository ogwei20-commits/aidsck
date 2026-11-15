import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLogs, projects, tasks } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import {
  createProject,
  createTask,
  ensureLocalUser,
  getDashboardSummary,
  getProject,
  listAuditLogs,
  listProjects,
  listTasks,
  patchProject,
} from "@/server/services/workspace";

const uid = DEFAULT_USER_ID;
const createdIds: string[] = [];
let projectId = "";

describe("真实数据库读写链路（F-04 / F-05 / F-06 / F-07 / F-13）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdIds.length > 0) {
      await db.delete(tasks).where(like(tasks.title, "[测试]%"));
      await db.delete(projects).where(like(projects.name, "[测试]%"));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds));
    }
    await closeDb();
  });

  it("创建项目后能从数据库读回", async () => {
    const p = await createProject(uid, {
      name: "[测试] 集成测试项目",
      description: "由 vitest 创建，跑完即清理",
      status: "planning",
      dataType: "U",
    });
    projectId = p.id;
    createdIds.push(p.id);
    const read = await getProject(uid, p.id);
    expect(read.name).toBe("[测试] 集成测试项目");
    expect(read.userId).toBe(uid);
  });

  it("修改项目进度会真实落库", async () => {
    const updated = await patchProject(uid, projectId, { progress: 42, status: "active" });
    expect(updated.progress).toBe(42);
    expect(updated.status).toBe("active");
  });

  it("创建任务并关联到项目", async () => {
    const t = await createTask(uid, {
      title: "[测试] 采集平台佣金",
      projectId,
      priority: 2,
      source: "user",
      dataType: "U",
    });
    createdIds.push(t.id);
    expect(t.projectId).toBe(projectId);
    expect((await listTasks(uid)).some((x) => x.id === t.id)).toBe(true);
  });

  it("任务的验收标准字段真实落库并可读回", async () => {
    const detail = "[测试] 三个平台各给一条来源链接，缺链接视为不合格";
    const t = await createTask(uid, {
      title: "[测试] 佣金对比（带验收标准）",
      detail,
      priority: 2,
      source: "user",
      dataType: "R",
    });
    createdIds.push(t.id);
    expect(t.detail).toBe(detail);
    const reread = (await listTasks(uid)).find((x) => x.id === t.id);
    expect(reread?.detail).toBe(detail);
  });

  it("项目列表包含新建项目", async () => {
    expect((await listProjects(uid)).some((p) => p.id === projectId)).toBe(true);
  });

  it("每次写入都产生审计日志", async () => {
    const logs = await listAuditLogs(100);
    const related = logs.filter((l) => l.entityId === projectId);
    expect(related.length).toBeGreaterThanOrEqual(2);
    expect(related.some((l) => l.action === "create")).toBe(true);
    expect(related.some((l) => l.action === "update")).toBe(true);
  });

  it("首页汇总数字来自真实查询", async () => {
    const summary = await getDashboardSummary(uid);
    expect(summary.projectCount).toBeGreaterThanOrEqual(1);
    expect(summary.logCount).toBeGreaterThanOrEqual(2);
    expect(summary.projects.length).toBeGreaterThanOrEqual(1);
  });
});

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, tasks, users } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { isUuid } from "@/lib/utils/format";
import type {
  CreateApprovalInput,
  CreateProjectInput,
  CreateTaskInput,
  PatchProjectInput,
} from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";
import { requireApproval } from "@/server/permissions/policy";

/** 本地单用户：首次写入前确保外键目标存在（不自动创建业务数据） */
export async function ensureLocalUser(userId: string): Promise<void> {
  if (!isUuid(userId)) {
    throw new AppError("INVALID_USER_ID", "APP_USER_ID 不是合法 UUID", 400);
  }
  await getDb()
    .insert(users)
    .values({ id: userId, displayName: "本地用户", email: null })
    .onConflictDoNothing({ target: users.id });
}

function assertUuid(id: string, label: string): void {
  if (!isUuid(id)) throw new AppError("INVALID_ID", `${label} 不是合法 ID`, 400);
}

export async function listProjects(userId: string, limit = 50) {
  return getDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);
}

export async function getProject(userId: string, id: string) {
  assertUuid(id, "项目");
  const [row] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("PROJECT_NOT_FOUND", "项目不存在或无权访问", 404);
  return row;
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const db = getDb();
  await ensureLocalUser(userId);
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: input.name,
      description: input.description,
      status: input.status,
      dataType: input.dataType,
    })
    .returning();
  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "project",
    entityId: row.id,
    permissionLevel: "L2",
    detail: { name: row.name, source: "api" },
  });
  return row;
}

export async function patchProject(userId: string, id: string, input: PatchProjectInput) {
  const db = getDb();
  await getProject(userId, id); // 存在性 + 归属校验

  // 归档属于 L3 破坏性操作：无人工审批记录一律拒绝（文档 9.3 / F-11）
  if (input.status === "archived") {
    await requireApproval(db, "archive", "project", id);
  }

  const [row] = await db
    .update(projects)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? "" } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.progress !== undefined ? { progress: Math.round(input.progress) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();

  await writeAudit(db, {
    userId,
    action: input.status === "archived" ? "archive" : "update",
    entityType: "project",
    entityId: id,
    permissionLevel: input.status === "archived" ? "L3" : "L2",
    detail: { changed: Object.keys(input) },
  });
  return row;
}

export async function listTasks(userId: string, limit = 50) {
  return getDb()
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt))
    .limit(limit);
}

export async function createTask(userId: string, input: CreateTaskInput) {
  const db = getDb();
  await ensureLocalUser(userId);
  if (input.projectId) {
    assertUuid(input.projectId, "项目");
    await getProject(userId, input.projectId); // 防止把任务挂到他人项目下
  }
  const [row] = await db
    .insert(tasks)
    .values({
      userId,
      projectId: input.projectId ?? null,
      title: input.title,
      detail: input.detail ?? "",
      priority: Math.round(input.priority),
      source: input.source,
      dataType: input.dataType,
    })
    .returning();
  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "task",
    entityId: row.id,
    permissionLevel: "L2",
    detail: { title: row.title, source: row.source },
  });
  return row;
}

export async function listAuditLogs(limit = 50) {
  return getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function listApprovals(limit = 50) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(inArray(auditLogs.action, ["approve", "reject"]))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function createApproval(userId: string, input: CreateApprovalInput) {
  const db = getDb();
  await ensureLocalUser(userId);
  const [row] = await db
    .insert(auditLogs)
    .values({
      userId,
      action: input.decision,
      entityType: input.entityType,
      entityId: input.entityId,
      permissionLevel: "L3",
      detail: { note: input.note, decidedBy: "local-user" },
    })
    .returning();
  return row;
}

export interface DashboardSummary {
  projectCount: number;
  activeProjectCount: number;
  taskCount: number;
  pendingTaskCount: number;
  logCount: number;
  projects: Awaited<ReturnType<typeof listProjects>>;
  tasks: Awaited<ReturnType<typeof listTasks>>;
  logs: Awaited<ReturnType<typeof listAuditLogs>>;
}

/** 首页全部数据来自数据库；无一条写死在页面里 */
export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const db = getDb();
  const [p] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(eq(projects.userId, userId));
  const [pa] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, "active")));
  const [t] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  const [tp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "pending")));
  const [l] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs);

  return {
    projectCount: p?.n ?? 0,
    activeProjectCount: pa?.n ?? 0,
    taskCount: t?.n ?? 0,
    pendingTaskCount: tp?.n ?? 0,
    logCount: l?.n ?? 0,
    projects: await listProjects(userId, 5),
    tasks: await listTasks(userId, 8),
    logs: await listAuditLogs(8),
  };
}

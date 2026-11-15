import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectMilestones, projects } from "@/db/schema";
import { AppError } from "@/lib/errors/api";

/**
 * 项目里程碑。
 *
 * 表在 Sprint 1 就建好了（project_milestones），但一直没有入口——
 * 于是「项目进度」只能手填一个百分比数字，没人知道它凭什么涨。
 * 里程碑就是那个凭据：完成几条、还差几条，进度才有来源。
 *
 * 日期只按「天」存：里程碑是计划项，精确到分秒没有意义，
 * 反而会因为时区把 11-20 显示成 11-19。统一按 UTC 当日 00:00 存、按 UTC 取日期。
 */

export interface MilestoneItem {
  id: string;
  projectId: string;
  title: string;
  /** YYYY-MM-DD */
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface MilestoneGroup {
  projectId: string;
  projectName: string;
  projectStatus: string;
  total: number;
  done: number;
  items: MilestoneItem[];
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** `YYYY-MM-DD` → 当日 00:00 UTC。只接受严格格式，避免 new Date 把非法串吞成 Invalid Date */
export function parseDueDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new AppError("VALIDATION_FAILED", "截止日期格式应为 YYYY-MM-DD", 422);
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_FAILED", "截止日期不是一个真实存在的日期", 422);
  }
  return date;
}

export async function listMilestones(userId: string): Promise<MilestoneGroup[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: projectMilestones.id,
      projectId: projectMilestones.projectId,
      projectName: projects.name,
      projectStatus: projects.status,
      title: projectMilestones.title,
      dueAt: projectMilestones.dueAt,
      completedAt: projectMilestones.completedAt,
      createdAt: projectMilestones.createdAt,
    })
    .from(projectMilestones)
    .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
    .where(eq(projectMilestones.userId, userId))
    // 未完成的排前面（PostgreSQL 升序默认 NULLS LAST，这里必须显式 NULLS FIRST），
    // 未完成里按截止日近的在前，没填日期的垫底
    .orderBy(
      sql`${projectMilestones.completedAt} asc nulls first`,
      sql`${projectMilestones.dueAt} asc nulls last`,
      asc(projectMilestones.createdAt),
    );

  const groups = new Map<string, MilestoneGroup>();
  for (const row of rows) {
    let group = groups.get(row.projectId);
    if (!group) {
      group = {
        projectId: row.projectId,
        projectName: row.projectName,
        projectStatus: row.projectStatus,
        total: 0,
        done: 0,
        items: [],
      };
      groups.set(row.projectId, group);
    }
    group.total += 1;
    if (row.completedAt) group.done += 1;
    group.items.push({
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      dueAt: isoDate(row.dueAt),
      completedAt: isoTime(row.completedAt),
      createdAt: isoTime(row.createdAt) ?? "",
    });
  }

  // 有未完成项的排前面：正在推进的项目才是需要看的
  return [...groups.values()].sort((a, b) => {
    const aOpen = a.total - a.done;
    const bOpen = b.total - b.done;
    if (aOpen === 0 && bOpen > 0) return 1;
    if (bOpen === 0 && aOpen > 0) return -1;
    return a.projectName.localeCompare(b.projectName, "zh-CN");
  });
}

export async function createMilestone(
  userId: string,
  input: { projectId: string; title: string; dueAt?: string | null },
): Promise<MilestoneItem> {
  const db = getDb();

  // 项目必须属于当前用户，否则会造出一条挂到别人项目上的里程碑
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) {
    throw new AppError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户", 404);
  }

  const [row] = await db
    .insert(projectMilestones)
    .values({
      userId,
      dataType: "U",
      projectId: input.projectId,
      title: input.title.trim(),
      dueAt: parseDueDate(input.dueAt),
    })
    .returning();

  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    dueAt: isoDate(row.dueAt),
    completedAt: isoTime(row.completedAt),
    createdAt: isoTime(row.createdAt) ?? "",
  };
}

export async function patchMilestone(
  userId: string,
  id: string,
  patch: { done?: boolean; title?: string },
): Promise<MilestoneItem> {
  const db = getDb();

  // 只更新传进来的字段：只改标题时若顺手把 completed_at 写成 null，
  // 等于「改个名字就重开」，用户不会预期这个副作用。
  const changes: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.done !== undefined) changes.completedAt = patch.done ? new Date() : null;
  if (patch.title !== undefined) changes.title = patch.title.trim();

  const [row] = await db
    .update(projectMilestones)
    .set(changes)
    .where(and(eq(projectMilestones.id, id), eq(projectMilestones.userId, userId)))
    .returning();

  if (!row) throw new AppError("MILESTONE_NOT_FOUND", "里程碑不存在或不属于当前用户", 404);

  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    dueAt: isoDate(row.dueAt),
    completedAt: isoTime(row.completedAt),
    createdAt: isoTime(row.createdAt) ?? "",
  };
}

/**
 * 里程碑允许直接删，不走审批。
 *
 * 理由：它没有外部副作用，删错只是少一条计划项，重建成本是几十秒；
 * 而项目 / 任务 / 报告 / 文件的删除会破坏业务数据的完整性，才需要审批闸门。
 * 把轻量记录也塞进审批，结果是用户为了删一条打错的计划项去点五次。
 */
export async function deleteMilestone(userId: string, id: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .delete(projectMilestones)
    .where(and(eq(projectMilestones.id, id), eq(projectMilestones.userId, userId)))
    .returning({ id: projectMilestones.id });
  if (rows.length === 0) {
    throw new AppError("MILESTONE_NOT_FOUND", "里程碑不存在或不属于当前用户", 404);
  }
}

import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projectStatusEnum, taskStatusEnum, baseColumns, timestamps, titleColumn } from "./shared";
import { users } from "./core";

/** 文档 4.2「项目和任务」五张表 — 工作流的载体 */

export const projects = pgTable(
  "projects",
  {
    ...baseColumns,
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: projectStatusEnum("status").notNull().default("planning"),
    progress: integer("progress").notNull().default(0),
    goal: text("goal").notNull().default(""),
  },
  (t) => [
    index("projects_user_status_idx").on(t.userId, t.status),
    index("projects_updated_at_idx").on(t.updatedAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    ...baseColumns,
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(2),
    source: text("source").notNull().default("user"),
    agentSlug: text("agent_slug"),
    dueAt: timestamp("due_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("task_dependencies_task_idx").on(t.taskId)],
);

export const taskLogs = pgTable(
  "task_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_logs_task_idx").on(t.taskId, t.createdAt)],
);

export const projectMilestones = pgTable(
  "project_milestones",
  {
    ...baseColumns,
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: titleColumn("title"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("project_milestones_project_idx").on(t.projectId)],
);

/** 供 seed / 测试使用的确定性用户，避免每次插入重复 */
export const LOCAL_USER = {
  displayName: "本地用户",
} as const;

export type UserRef = typeof users.$inferSelect;

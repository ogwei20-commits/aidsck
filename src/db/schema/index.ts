import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Sprint 1 最小 Schema：只建「打通一条完整业务流程」所需的 4 张表。
 * 文档 4.2 的其余表在 Sprint 2 按迁移文件逐批加入，此处不提前铺开。
 *
 * 金额字段规范（文档 4.4-7）：未来一律使用 numeric(18,4)，禁止 float 存货币。
 * 汇率历史、来源关联、R/E/P/S/U 数据类型为后续迁移的强制约束。
 */

export const dataTypeEnum = pgEnum("data_type", ["R", "E", "P", "S", "U"]);
export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "running",
  "blocked",
  "review",
  "done",
  "cancelled",
]);
export const permissionLevelEnum = pgEnum("permission_level", ["L1", "L2", "L3", "L4"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  ...timestamps,
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: projectStatusEnum("status").notNull().default("planning"),
    progress: integer("progress").notNull().default(0),
    dataType: dataTypeEnum("data_type").notNull().default("U"),
    ...timestamps,
  },
  (t) => [
    index("projects_user_status_idx").on(t.userId, t.status),
    index("projects_updated_at_idx").on(t.updatedAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(2),
    source: text("source").notNull().default("user"),
    dataType: dataTypeEnum("data_type").notNull().default("U"),
    ...timestamps,
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    permissionLevel: permissionLevelEnum("permission_level").notNull().default("L1"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type UserRow = typeof users.$inferSelect;

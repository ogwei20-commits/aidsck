import { numeric, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 跨域共享的枚举与列定义。
 * 单独成文件，避免各域 schema 互相 import 形成环。
 */

/** 文档 4.3 数据类型标准 */
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

/** 文档 9.1 权限分级 */
export const permissionLevelEnum = pgEnum("permission_level", ["L1", "L2", "L3", "L4"]);

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** 金额列：文档 4.4-7 禁止用浮点存货币，统一 numeric(18,4) */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** 汇率/比率列：保留更多小数位 */
export const rate = (name: string) => numeric(name, { precision: 18, scale: 8 });

/**
 * 业务数据必备的公共列（文档 4.1）：
 * 主键、所属用户、数据类型、创建与更新时间。
 * 多用户扩展时 user_id 已经存在，不需要再改表。
 */
export const baseColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  dataType: dataTypeEnum("data_type").notNull().default("U"),
  ...timestamps,
};

/** 允许「暂不归属任何用户」的公共列（系统级或全局词典类数据） */
export const sharedColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  dataType: dataTypeEnum("data_type").notNull().default("U"),
  ...timestamps,
};

export const titleColumn = (name = "name") => text(name).notNull();
export const noteColumn = (name = "note") => text(name).notNull().default("");

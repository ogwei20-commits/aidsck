import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  approvalStatusEnum,
  permissionLevelEnum,
  runStatusEnum,
  sharedColumns,
  timestamps,
} from "./shared";
import { users } from "./core";

/** 文档 4.2「Agent 和工作流」七张表 — AI 协调层 */

export const tools = pgTable("tool_registry", {
  ...sharedColumns,
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  /** 工具访问白名单（文档 5.4）：L1 只读，L3 才是外部写入 */
  permissionLevel: permissionLevelEnum("permission_level").notNull().default("L1"),
  enabled: text("enabled").notNull().default("true"),
});

export const agents = pgTable("agents", {
  ...sharedColumns,
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description").notNull().default(""),
  systemInstructions: text("system_instructions").notNull().default(""),
  allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  permissionLevel: permissionLevelEnum("permission_level").notNull().default("L1"),
  /** 文档 5.4 执行限制 */
  maxRunsPerTask: integer("max_runs_per_task").notNull().default(3),
  timeoutSeconds: integer("timeout_seconds").notNull().default(120),
  status: text("status").notNull().default("ready"),
  version: text("version").notNull().default("1.0.0"),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    status: runStatusEnum("status").notNull().default("queued"),
    provider: text("provider").notNull().default("none"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_runs_agent_idx").on(t.agentId, t.createdAt)],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 一次会话内的消息序列；为空表示单轮直接调用 */
    conversationId: uuid("conversation_id"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_messages_run_idx").on(t.runId, t.createdAt)],
);

export const workflows = pgTable(
  "workflows",
  {
    ...sharedColumns,
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** 节点定义（文档 8 的 15 个节点） */
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    enabled: text("enabled").notNull().default("true"),
  },
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    status: runStatusEnum("status").notNull().default("queued"),
    currentNode: text("current_node"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workflow_runs_workflow_idx").on(t.workflowId, t.createdAt)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull().default(""),
    status: approvalStatusEnum("status").notNull().default("pending"),
    permissionLevel: permissionLevelEnum("permission_level").notNull().default("L3"),
    note: text("note").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("approvals_entity_idx").on(t.entityType, t.entityId, t.status)],
);

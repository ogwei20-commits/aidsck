import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./shared";

/** 文档 4.2「知识和文件」五张表 */

export const files = pgTable(
  "files",
  {
    ...baseColumns,
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** 相对 storage/uploads 的路径，不落绝对路径，便于迁移 */
    storagePath: text("storage_path").notNull(),
    checksum: text("checksum").notNull().default(""),
    purpose: text("purpose").notNull().default(""),
    /**
     * 内容提取状态。pending 未解析 / ok 已入库 / failed 解析失败（有原因）/
     * unsupported 类型不支持（不是错误，是明确不做）。
     * 必须有状态字段：只有「有没有 chunk」无法区分「没点过」和「每次都失败」。
     */
    extractStatus: text("extract_status").notNull().default("pending"),
    extractError: text("extract_error").notNull().default(""),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    charCount: integer("char_count").notNull().default(0),
  },
  (t) => [index("files_user_idx").on(t.userId, t.createdAt)],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    ...baseColumns,
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: text("tags").notNull().default(""),
    sourceType: text("source_type").notNull().default("manual"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    researchId: uuid("research_id"),
  },
  (t) => [index("knowledge_items_user_idx").on(t.userId, t.category)],
);

/** 文件切块：为后续向量检索预留，第一阶段只存文本与序号 */
export const fileChunks = pgTable(
  "file_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull().default(0),
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("file_chunks_file_idx").on(t.fileId, t.chunkIndex)],
);

export const reports = pgTable(
  "reports",
  {
    ...baseColumns,
    title: text("title").notNull(),
    kind: text("kind").notNull().default("research"),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    projectId: uuid("project_id"),
    researchId: uuid("research_id"),
    status: text("status").notNull().default("draft"),
    filePath: text("file_path").notNull().default(""),
  },
  (t) => [index("reports_user_idx").on(t.userId, t.kind)],
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    sourceTitle: text("source_title").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    quote: text("quote").notNull().default(""),
    dataType: text("data_type").notNull().default("U"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("citations_report_idx").on(t.reportId)],
);

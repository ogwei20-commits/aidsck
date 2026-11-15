/**
 * Schema 汇总入口。按文档 4.2 的四个域分包，此处只做 re-export，
 * 使 `import { projects } from "@/db/schema"` 这类既有引用保持不变。
 */
export * from "./shared";
export * from "./core";
export * from "./work";
export * from "./ai";
export * from "./research";
export * from "./finance";
export * from "./learning";
export * from "./knowledge";

import type { auditLogs, users } from "./core";
import type { projects, tasks } from "./work";

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type UserRow = typeof users.$inferSelect;

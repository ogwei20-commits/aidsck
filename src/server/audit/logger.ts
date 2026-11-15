import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditLogs } from "@/db/schema";
import * as schema from "@/db/schema";
import type { PermissionLevel } from "@/types";

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "approve"
  | "reject"
  | "run"
  | "export"
  | "login"
  | "error";

/** 文档 9.2：所有重要操作必须留下日志。写日志失败不得静默吞掉。 */
export async function writeAudit(
  db: PostgresJsDatabase<typeof schema>,
  input: {
    userId: string | null;
    action: AuditAction | string;
    entityType: string;
    entityId?: string | null;
    permissionLevel?: PermissionLevel;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    permissionLevel: input.permissionLevel ?? "L1",
    detail: input.detail ?? {},
  });
}

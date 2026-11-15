import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditLogs } from "@/db/schema";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import type { PermissionLevel } from "@/types";

/**
 * 文档 9.1 权限分级（Sprint 1 最小可验证骨架）
 * L1 查询/整理/分析 · L2 生成草稿/计算/保存 · L3 经批准后执行外部操作 · L4 禁止 AI 自主执行
 */
const ALLOWED: Record<PermissionLevel, readonly string[]> = {
  L1: ["read", "list", "analyze"],
  L2: ["create", "update", "calculate", "save_draft"],
  L3: ["archive", "export", "external_call", "publish"],
  L4: [],
};

export function assertAllowed(level: PermissionLevel, action: string): void {
  if (level === "L4") {
    throw new AppError("PERMISSION_DENIED", `L4 操作禁止 AI 自主执行：${action}`, 403);
  }
  if (!ALLOWED[level].includes(action)) {
    throw new AppError(
      "PERMISSION_DENIED",
      `权限等级 ${level} 不允许执行 ${action}`,
      403,
    );
  }
}

/**
 * 人工审批闸门：L3 操作必须存在一条 decision=approve 的审计记录，否则拒绝。
 * 审批记录由 /api/v1/approvals 写入，不在代码里自行放行（文档 9.3「防止 Agent 越权」）。
 */
export async function requireApproval(
  db: PostgresJsDatabase<typeof schema>,
  action: string,
  entityType: string,
  entityId: string,
  level: PermissionLevel = "L3",
): Promise<void> {
  assertAllowed(level, action);
  const rows = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "approve"),
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new AppError(
      "APPROVAL_REQUIRED",
      `操作「${action}」需要人工审批：当前无有效审批记录，已阻止执行。请先在审批中心提交批准。`,
      403,
    );
  }
}

export type PermissionLevel = "L1" | "L2" | "L3" | "L4";

export type DataType = "R" | "E" | "P" | "S" | "U";

export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";

export type TaskStatus = "pending" | "running" | "blocked" | "review" | "done" | "cancelled";

/** ready=已可用；partial=最小可用（功能未完整）；planned=仅占位，禁止误认为可用 */
export type ModuleStatus = "ready" | "partial" | "planned";

export interface NavItem {
  slug: string;
  label: string;
  group: string;
  status: ModuleStatus;
  sprint: string;
  description: string;
}

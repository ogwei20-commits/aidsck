import type { DataType, ProjectStatus, TaskStatus } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "规划中",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "待处理",
  running: "执行中",
  blocked: "受阻",
  review: "待审核",
  done: "已完成",
  cancelled: "已取消",
};

/** 文档 4.3：R 真实 / E 估算 / P 预测 / S 模拟 / U 用户输入 */
export const DATA_TYPE_LABEL: Record<DataType, string> = {
  R: "真实数据",
  E: "估算数据",
  P: "预测数据",
  S: "模拟数据",
  U: "用户输入",
};

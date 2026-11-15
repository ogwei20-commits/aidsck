import { OPS_MODULES } from "./defs/ops";
import { EXECUTION_MODULES } from "./defs/execution";
import { RESEARCH_MODULES } from "./defs/research";
import type { ModuleDef } from "./types";

/**
 * 19 个模块里，15 个走通用 CRUD 内核。
 * 不走内核的三个：综合首页（汇总视图）、AI 总管家（对话）、数据溯源（跨表只读汇总）。
 */
export const MODULES: ModuleDef[] = [...EXECUTION_MODULES, ...RESEARCH_MODULES, ...OPS_MODULES];

export const MODULE_MAP = new Map<string, ModuleDef>(MODULES.map((m) => [m.slug, m]));

export function getModule(slug: string): ModuleDef | undefined {
  return MODULE_MAP.get(slug);
}

/** 允许写入的表名白名单，任何动态标识符都必须先过这一关 */
export const ALLOWED_TABLES = new Set(MODULES.map((m) => m.table));

export function moduleStatusOption(slug: string, value: string) {
  const def = MODULE_MAP.get(slug);
  return def?.statusOptions?.find((o) => o.value === value);
}

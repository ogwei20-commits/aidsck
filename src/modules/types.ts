/** 字段控件类型：决定表单渲染哪种控件、提交时如何校验与转换 */
export type FieldKind = "text" | "textarea" | "int" | "money" | "rate" | "date" | "select" | "ref";

export type Tone = "accent" | "ok" | "warn" | "danger" | "muted";

export interface SelectOption {
  value: string;
  label: string;
  tone?: Tone;
}

export interface ModuleField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: SelectOption[];
  /** ref 类型：引用哪张表、显示哪个字段 */
  refTable?: string;
  refLabel?: string;
  placeholder?: string;
  default?: string;
}

export interface ListColumn {
  name: string;
  label: string;
  kind?: "text" | "mono" | "money" | "badge" | "progress";
  /** badge 列用于把 raw 值映射成中文标签与色调 */
  options?: SelectOption[];
}

/**
 * 数据可见范围：
 * - user   只属于当前用户（默认）
 * - shared 用户数据 + 全局内置（如内置 Agent、平台词典）
 * - global 无用户维度（系统配置）
 */
export type DataScope = "user" | "shared" | "global";

export interface ModuleDef {
  slug: string;
  label: string;
  group: string;
  /** 真实表名（来自 schema，白名单内） */
  table: string;
  scope?: DataScope;
  /** 列表主标题字段 */
  titleField: string;
  /** 列表副标题字段 */
  subtitleField?: string;
  statusField?: string;
  statusOptions?: SelectOption[];
  fields: ModuleField[];
  columns: ListColumn[];
  /** 一句话说明这个模块在你的生意里解决什么问题 */
  purpose: string;
  /** 创建表单的提交按钮文案 */
  createLabel: string;
  /** 空列表时告诉用户下一步做什么，不是"暂无数据" */
  emptyHint: string;
  orderBy?: string;
}

export interface ModuleRow extends Record<string, unknown> {
  id: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

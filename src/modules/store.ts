import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { ALLOWED_TABLES } from "./registry";
import type { ModuleDef, ModuleField } from "./types";

/**
 * 通用数据内核。
 *
 * 安全边界：表名只来自 registry 白名单（ALLOWED_TABLES），列名只来自模块定义的
 * fields，值一律走参数绑定。任何外部传入的字符串都不会进入标识符位置。
 */

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * 数据库返回的是 snake_case 列名，而模块定义（fields / columns）用 camelCase。
 * 读取时统一转成 camelCase，否则 `row["commissionRate"]` 永远取不到
 * `commission_rate`，表格会静默显示成「—」。
 */
function toCamelRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) out[camel(key)] = value;
  return out;
}

function tableIdent(def: ModuleDef): SQL {
  if (!ALLOWED_TABLES.has(def.table)) {
    throw new Error(`表 ${def.table} 不在白名单内`);
  }
  return sql.raw(`"${def.table}"`);
}

function columnIdent(name: string): SQL {
  // 列名同样只可能来自注册表；额外做一次格式校验，杜绝异常字符
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`非法列名：${name}`);
  }
  return sql.raw(`"${name}"`);
}

function coerce(field: ModuleField, raw: unknown): string | number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return field.required ? undefined : null;
  switch (field.kind) {
    case "int": {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    case "money":
    case "rate": {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : "0";
    }
    default:
      return String(raw).slice(0, 20000);
  }
}

function scopeWhere(def: ModuleDef, userId: string): SQL {
  if (def.scope === "global") return sql`true`;
  if (def.scope === "shared") return sql`(user_id = ${userId} or user_id is null)`;
  return sql`user_id = ${userId}`;
}

export type Row = Record<string, unknown>;

export async function listRows(def: ModuleDef, userId: string, limit = 200): Promise<Row[]> {
  const db = getDb();
  const order = def.scope === "global" ? sql`"created_at" desc` : sql`"updated_at" desc`;
  const result = await db.execute(
    sql`select * from ${tableIdent(def)} where ${scopeWhere(def, userId)} order by ${order} limit ${limit}`,
  );
  return (result as unknown as Row[]).map(toCamelRow);
}

export async function getRow(def: ModuleDef, userId: string, id: string): Promise<Row | null> {
  const db = getDb();
  const result = await db.execute(
    sql`select * from ${tableIdent(def)} where "id" = ${id} and ${scopeWhere(def, userId)} limit 1`,
  );
  const rows = result as unknown as Row[];
  return rows[0] ? toCamelRow(rows[0]) : null;
}

/** 缺必填项时返回缺失字段的中文名，交由 API 层转成 422 */
export function missingRequired(def: ModuleDef, input: Row): string[] {
  return def.fields
    .filter((f) => f.required && (input[f.name] === undefined || input[f.name] === null || input[f.name] === ""))
    .map((f) => f.label);
}

export async function createRow(def: ModuleDef, userId: string, input: Row): Promise<Row> {
  const db = getDb();
  const cols: SQL[] = [];
  const vals: SQL[] = [];

  if (def.scope !== "global") {
    cols.push(columnIdent("user_id"));
    vals.push(sql`${userId}`);
    // system_settings 是唯一的 global 表，schema 里没有 data_type 列
    cols.push(columnIdent("data_type"));
    vals.push(sql`${"U"}`);
  }

  for (const field of def.fields) {
    const value = coerce(field, input[field.name] ?? field.default);
    if (value === undefined) continue;
    cols.push(columnIdent(snake(field.name)));
    vals.push(sql`${value}`);
  }

  const columnList = sql.join(cols, sql`, `);
  const valueList = sql.join(vals, sql`, `);
  const result = await db.execute(
    sql`insert into ${tableIdent(def)} (${columnList}) values (${valueList}) returning *`,
  );
  const rows = result as unknown as Row[];
  return rows[0] ? toCamelRow(rows[0]) : rows[0];
}

export async function updateRow(def: ModuleDef, userId: string, id: string, input: Row): Promise<Row | null> {
  const db = getDb();
  const sets: SQL[] = [];

  for (const field of def.fields) {
    if (!(field.name in input)) continue;
    const value = coerce(field, input[field.name]);
    if (value === undefined) continue;
    sets.push(sql`${columnIdent(snake(field.name))} = ${value}`);
  }

  if (sets.length === 0) return getRow(def, userId, id);

  if (def.scope !== "global") {
    sets.push(sql`"updated_at" = now()`);
  }

  const setList = sql.join(sets, sql`, `);
  const result = await db.execute(
    sql`update ${tableIdent(def)} set ${setList} where "id" = ${id} and ${scopeWhere(def, userId)} returning *`,
  );
  const rows = result as unknown as Row[];
  return rows[0] ? toCamelRow(rows[0]) : null;
}

export async function deleteRow(def: ModuleDef, userId: string, id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(
    sql`delete from ${tableIdent(def)} where "id" = ${id} and ${scopeWhere(def, userId)} returning "id"`,
  );
  const rows = result as unknown as Row[];
  return rows.length > 0;
}

/** 引用型字段的下拉选项：只取 id 与标签字段 */
export async function refOptions(
  table: string,
  labelField: string,
  userId: string,
): Promise<{ value: string; label: string }[]> {
  if (!ALLOWED_TABLES.has(table)) return [];
  const db = getDb();
  const result = await db.execute(
    sql`select "id", ${columnIdent(snake(labelField))} as "label" from ${sql.raw(`"${table}"`)}
        where (user_id = ${userId} or user_id is null)
        order by ${columnIdent(snake(labelField))} asc limit 200`,
  );
  const rows = result as unknown as Row[];
  return rows.map((r) => ({ value: String(r.id), label: String(r.label ?? "未命名") }));
}

export interface ListQuery {
  /** 关键词。空串表示不筛选 */
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedRows {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 实际生效的关键词（已 trim），页面回显用 */
  q: string;
}

/**
 * 搜索列：只用模块定义里声明过的字段。
 *
 * 为什么不「所有文本列都搜」：列名要拼进 SQL 标识符位置，唯一安全的来源
 * 就是注册表里的字段定义（它们一定对应真实列）。titleField / subtitleField
 * 优先，因为列表里最显眼的两列命中率最高。
 */
function searchColumns(def: ModuleDef): string[] {
  const declared = new Set(def.fields.map((f) => f.name));
  const picked: string[] = [];
  for (const name of [def.titleField, def.subtitleField]) {
    if (name && declared.has(name) && !picked.includes(name)) picked.push(name);
  }
  for (const field of def.fields) {
    if (picked.length >= 5) break;
    if (field.kind !== "text" && field.kind !== "textarea") continue;
    if (!picked.includes(field.name)) picked.push(field.name);
  }
  return picked.slice(0, 5);
}

/**
 * 关键词转成 LIKE 模式。
 *
 * `%` 和 `_` 是 LIKE 的通配符：用户搜「50%」时若不转义，会变成「以 50 开头」，
 * 搜「a_b」会匹配到「axb」。反斜杠本身也要先转义，否则 `\%` 会被吃掉。
 */
export function toLikePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

function searchWhere(def: ModuleDef, q: string): SQL | null {
  const keyword = q.trim();
  if (!keyword) return null;
  const pattern = toLikePattern(keyword);
  const parts = searchColumns(def).map(
    (name) => sql`${columnIdent(snake(name))}::text ilike ${pattern}`,
  );
  if (parts.length === 0) return null;
  return sql`(${sql.join(parts, sql` or `)})`;
}

/**
 * 带搜索与分页的列表读取。
 *
 * 与 `listRows` 分开而不是改签名：`listRows` 被接口和首页等处以数组形状消费，
 * 改返回形状会连带改一堆调用点；而分页只有列表页需要。
 *
 * 总数单独 count 一次，不用「取到的行数」代替——否则第 2 页会显示「共 20 条」。
 */
export async function listRowsPaged(def: ModuleDef, userId: string, query: ListQuery = {}): Promise<PagedRows> {
  const db = getDb();
  const q = (query.q ?? "").trim().slice(0, 100);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const where = searchWhere(def, q);
  const scope = scopeWhere(def, userId);
  const filter = where ? sql`${scope} and ${where}` : scope;

  const countResult = await db.execute(
    sql`select count(*)::int as n from ${tableIdent(def)} where ${filter}`,
  );
  const total = Number((countResult as unknown as Row[])[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 页码越界时夹回最后一页：删到只剩一页后停留在第 3 页，会看到「共 5 条」却是空表
  const page = Math.min(Math.max(Math.trunc(query.page ?? 1), 1), totalPages);

  const order = def.scope === "global" ? sql`"created_at" desc` : sql`"updated_at" desc`;
  const result = await db.execute(
    sql`select * from ${tableIdent(def)} where ${filter} order by ${order}
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
  );

  return {
    rows: (result as unknown as Row[]).map(toCamelRow),
    total,
    page,
    pageSize,
    totalPages,
    q,
  };
}

/** 模块行数，用于首页与导航角标 */
export async function countRows(def: ModuleDef, userId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    sql`select count(*)::int as n from ${tableIdent(def)} where ${scopeWhere(def, userId)}`,
  );
  const rows = result as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

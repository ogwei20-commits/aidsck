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

/** 模块行数，用于首页与导航角标 */
export async function countRows(def: ModuleDef, userId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    sql`select count(*)::int as n from ${tableIdent(def)} where ${scopeWhere(def, userId)}`,
  );
  const rows = result as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

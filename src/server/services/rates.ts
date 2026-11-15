import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { currencyRates, financeScenarios } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { CURRENCY_CODES, CURRENCY_LABELS } from "@/lib/finance/currencies";
import { pickQuote, withInverseQuotes, type FxQuote } from "@/lib/finance/fx";

export { CURRENCY_CODES, CURRENCY_LABELS };

/**
 * 汇率服务。
 *
 * 三条硬规则：
 * 1. 只追加、不覆盖。currency_rates 的价值就在于「上个月那笔账按当时汇率是多少」，
 *    update 掉历史等于把账本改了。
 * 2. 抓取失败不写半截数据。要么整批进来，要么一条都不进。
 * 3. 抓取时同源同日同值不重复写。否则连点五次「拉取最新」，历史里就多五条一样的。
 */

/** 只抓清单里的币种，不把接口返回的一百多个币种全灌进库里 */
export const DEFAULT_TARGET_CURRENCIES: string[] = [...CURRENCY_CODES];

export interface RateHistoryRow extends FxQuote {
  id: string;
  dataType: string;
}

export interface RatePair {
  base: string;
  quote: string;
  current: RateHistoryRow | null;
  historyCount: number;
}

const iso = (v: Date | string | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** 全量历史（倒序），用于「历史版本」列表 */
export async function listRates(limit = 200): Promise<RateHistoryRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(currencyRates)
    .orderBy(desc(currencyRates.effectiveAt), desc(currencyRates.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => ({
    id: row.id,
    base: row.baseCurrency.toUpperCase(),
    quote: row.quoteCurrency.toUpperCase(),
    rate: Number(row.rate),
    asOf: iso(row.effectiveAt),
    source: row.source,
    dataType: row.dataType,
  }));
}

/** 每个货币对只取最新一条，供页面解析汇率用 */
export async function listCurrentRates(): Promise<FxQuote[]> {
  const all = await listRates(500);
  const map = new Map<string, RateHistoryRow>();
  for (const row of all) {
    const key = `${row.base}/${row.quote}`;
    const found = map.get(key);
    if (!found || (row.asOf ?? "") > (found.asOf ?? "")) map.set(key, row);
  }
  return [...map.values()].map(({ base, quote, rate, asOf, source }) => ({
    base,
    quote,
    rate,
    asOf,
    source,
  }));
}

/** 按货币对分组：当前值 + 历史条数 */
export async function listRatePairs(): Promise<RatePair[]> {
  const all = await listRates(500);
  const map = new Map<string, RatePair>();
  for (const row of all) {
    const key = `${row.base}/${row.quote}`;
    const found = map.get(key);
    if (!found) {
      map.set(key, { base: row.base, quote: row.quote, current: row, historyCount: 1 });
      continue;
    }
    found.historyCount += 1;
    if ((row.asOf ?? "") > (found.current?.asOf ?? "")) found.current = row;
  }
  return [...map.values()].sort(
    (a, b) => `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`) || a.base.localeCompare(b.base),
  );
}

/**
 * 供计算/展示使用的汇率视图：在真实记录之上补反向镜像。
 * 汇率表本身仍只存真实采集/录入的值，历史不被推算值污染。
 */
export async function listEffectiveQuotes(): Promise<FxQuote[]> {
  return withInverseQuotes(await listCurrentRates());
}

export async function latestRate(base: string, quote: string): Promise<FxQuote | null> {
  return pickQuote(await listEffectiveQuotes(), base, quote);
}

export type CreateRateResult = RateHistoryRow;

export async function createRate(input: {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  effectiveAt?: string;
  source?: string;
  dataType?: string;
}): Promise<CreateRateResult> {
  const db = getDb();
  const base = input.baseCurrency.toUpperCase();
  const quote = input.quoteCurrency.toUpperCase();

  if (base === quote) {
    throw new AppError("RATE_SAME_CURRENCY", "基准币种与报价币种不能相同", 422);
  }

  // 只给日期时按当天 UTC 零点存，避免「同一天录两次」变成两条不同时刻
  const when = input.effectiveAt?.trim()
    ? new Date(input.effectiveAt)
    : new Date();
  if (Number.isNaN(when.getTime())) {
    throw new AppError("RATE_BAD_DATE", "生效时间格式不正确，请用 YYYY-MM-DD", 422, {
      fields: [{ field: "effectiveAt", message: "格式不正确" }],
    });
  }

  const [row] = await db
    .insert(currencyRates)
    .values({
      baseCurrency: base,
      quoteCurrency: quote,
      rate: input.rate.toFixed(8),
      effectiveAt: when,
      source: input.source?.trim() || "manual",
      dataType: input.dataType || "U",
    })
    .returning();

  return {
    id: row.id,
    base: row.baseCurrency.toUpperCase(),
    quote: row.quoteCurrency.toUpperCase(),
    rate: Number(row.rate),
    asOf: iso(row.effectiveAt),
    source: row.source,
    dataType: row.dataType,
  };
}

interface RemoteRates {
  base: string;
  rates: Record<string, number>;
  asOf: Date;
  source: string;
  provider: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function numberMap(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(key) && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

/** 主源：exchangerate-api 免费版，无需 key，覆盖 TWD/VND 等 ECB 不发布的币种 */
async function fetchFromErApi(base: string): Promise<RemoteRates> {
  const data = (await fetchJson(`https://open.er-api.com/v6/latest/${base}`)) as Record<string, unknown>;
  if (String(data.result ?? "") !== "success") {
    throw new Error(String(data["error-type"] ?? "返回状态异常"));
  }
  const rates = numberMap(data.rates);
  if (Object.keys(rates).length === 0) throw new Error("返回的汇率是空的");
  const unix = Number(data.time_last_update_unix);
  return {
    base,
    rates,
    asOf: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000) : new Date(),
    source: "exchangerate-api",
    provider: "https://www.exchangerate-api.com",
  };
}

/** 备源：frankfurter（ECB 数据，无 key） */
async function fetchFromFrankfurter(base: string): Promise<RemoteRates> {
  const data = (await fetchJson(`https://api.frankfurter.dev/v1/latest?base=${base}`)) as Record<string, unknown>;
  const rates = numberMap(data.rates);
  if (Object.keys(rates).length === 0) throw new Error("返回的汇率是空的");
  const date = String(data.date ?? "");
  const asOf = date ? new Date(`${date}T00:00:00Z`) : new Date();
  return {
    base,
    rates,
    asOf: Number.isNaN(asOf.getTime()) ? new Date() : asOf,
    source: "frankfurter",
    provider: "https://frankfurter.dev",
  };
}

export interface FetchRatesResult {
  base: string;
  source: string;
  provider: string;
  asOf: string;
  inserted: RateHistoryRow[];
  skipped: { quote: string; reason: string }[];
}

const sameDay = (a: string | null, b: Date): boolean => {
  if (!a) return false;
  const x = new Date(a);
  return (
    x.getUTCFullYear() === b.getUTCFullYear() &&
    x.getUTCMonth() === b.getUTCMonth() &&
    x.getUTCDate() === b.getUTCDate()
  );
};

/**
 * 抓取并落库。两个源依次尝试，都失败时抛 502——不返回空结果冒充成功。
 */
export async function fetchAndStoreRates(
  base: string,
  targets?: string[],
): Promise<FetchRatesResult> {
  const baseCode = base.toUpperCase();
  const list = (targets && targets.length > 0 ? targets : DEFAULT_TARGET_CURRENCIES)
    .map((t) => t.toUpperCase())
    .filter((t) => t !== baseCode);

  let remote: RemoteRates | null = null;
  const errors: string[] = [];
  for (const attempt of [fetchFromErApi, fetchFromFrankfurter]) {
    try {
      remote = await attempt(baseCode);
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!remote) {
    throw new AppError(
      "RATE_SOURCE_UNAVAILABLE",
      `两个汇率源都不可达（${errors.join("；")}）。断网时就手动录一条，别等它自己好。`,
      502,
    );
  }

  const existing = await listCurrentRates();
  const db = getDb();
  const inserted: RateHistoryRow[] = [];
  const skipped: { quote: string; reason: string }[] = [];
  const values: (typeof currencyRates.$inferInsert)[] = [];

  for (const quote of list) {
    const rate = remote.rates[quote];
    if (!Number.isFinite(rate) || rate <= 0) {
      skipped.push({ quote, reason: "该源没有这个币种" });
      continue;
    }
    const current = pickQuote(existing, baseCode, quote);
    // 同源 + 同一天 + 同值 = 这次点击没有带来新信息，不写
    if (
      current &&
      current.source === remote.source &&
      sameDay(current.asOf, remote.asOf) &&
      Math.abs(current.rate - rate) < 1e-10
    ) {
      skipped.push({ quote, reason: "同源同日同值，未重复写入" });
      continue;
    }
    values.push({
      baseCurrency: baseCode,
      quoteCurrency: quote,
      rate: rate.toFixed(8),
      effectiveAt: remote.asOf,
      source: remote.source,
      // 央行/聚合行情属于「平台口径」，不是实测
      dataType: "P",
    });
  }

  if (values.length > 0) {
    const rows = await db.insert(currencyRates).values(values).returning();
    for (const row of rows) {
      inserted.push({
        id: row.id,
        base: row.baseCurrency.toUpperCase(),
        quote: row.quoteCurrency.toUpperCase(),
        rate: Number(row.rate),
        asOf: iso(row.effectiveAt),
        source: row.source,
        dataType: row.dataType,
      });
    }
  }

  return {
    base: baseCode,
    source: remote.source,
    provider: remote.provider,
    asOf: iso(remote.asOf) ?? new Date().toISOString(),
    inserted,
    skipped,
  };
}

export interface LockFxResult {
  scenarioId: string;
  costCurrency: string;
  currency: string;
  rate: number;
  asOf: string | null;
  source: string;
}

/**
 * 把当前汇率锁定到方案上。
 * 锁定之后，无论汇率表怎么变，这个方案算出来的数都不再变。
 */
export async function lockScenarioFx(userId: string, scenarioId: string): Promise<LockFxResult> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(financeScenarios)
    .where(and(eq(financeScenarios.id, scenarioId), eq(financeScenarios.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("SCENARIO_NOT_FOUND", "方案不存在或不属于当前用户", 404);

  const base = row.costCurrency.trim().toUpperCase();
  const quote = row.currency.trim().toUpperCase();
  if (!base || base === quote) {
    throw new AppError(
      "FX_NOT_NEEDED",
      "这个方案的成本币种与售价币种相同，不需要折算，也就没有汇率可以锁",
      422,
    );
  }

  const current = await latestRate(base, quote);
  if (!current) {
    throw new AppError(
      "RATE_MISSING",
      `没有 ${base} → ${quote} 的汇率。先在「汇率」里录一条或点「拉取最新」，再来锁定。`,
      422,
    );
  }

  await db
    .update(financeScenarios)
    .set({
      fxRate: current.rate.toFixed(8),
      fxAsOf: current.asOf ? new Date(current.asOf) : new Date(),
      fxSource: current.source,
    })
    .where(and(eq(financeScenarios.id, scenarioId), eq(financeScenarios.userId, userId)));

  return {
    scenarioId,
    costCurrency: base,
    currency: quote,
    rate: current.rate,
    asOf: current.asOf,
    source: current.source,
  };
}

/** 解除锁定：回到「按当前汇率试算」 */
export async function unlockScenarioFx(userId: string, scenarioId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: financeScenarios.id })
    .from(financeScenarios)
    .where(and(eq(financeScenarios.id, scenarioId), eq(financeScenarios.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("SCENARIO_NOT_FOUND", "方案不存在或不属于当前用户", 404);

  await db
    .update(financeScenarios)
    .set({ fxRate: "0", fxAsOf: null, fxSource: "" })
    .where(and(eq(financeScenarios.id, scenarioId), eq(financeScenarios.userId, userId)));
}

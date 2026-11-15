/**
 * 汇率解析（纯函数，无数据库、无 server-only）。
 *
 * 为什么单独一层：同一件事要在三处给出同一个答案——
 * 页面结果卡、POST /finance/calculate、锁定快照接口。
 * 三处各写一遍，迟早出现「页面上按 7.1 算、接口按 7.3 算」。
 *
 * 口径约定（与 currency_rates 表一致）：
 *   rate 表示「1 单位 base = rate 单位 quote」
 *   成本币种 CNY、售价币种 USD、rate 0.1408 → 100 元采购成本 = 14.08 美元
 */

export interface FxQuote {
  base: string;
  quote: string;
  rate: number;
  /** ISO 时间；历史数据可能为空 */
  asOf: string | null;
  source: string;
}

export interface FxResolution {
  /** 成本币种与售价币种不同，才需要折算 */
  needed: boolean;
  /** 实际采用的汇率；缺失时为 1（仅用于继续计算，不代表汇率是 1） */
  rate: number;
  asOf: string | null;
  source: string;
  /** 用的是方案上锁定的快照，而不是当前汇率 */
  locked: boolean;
  /** 需要折算但没有可用汇率——此时所有金额结论都不可信 */
  missing: boolean;
  base: string;
  quote: string;
}

export interface FxResolveInput {
  costCurrency?: string | null;
  currency?: string | null;
  /** 方案上锁定的汇率；> 0 表示已锁定 */
  lockedRate?: number | string | null;
  lockedAsOf?: string | Date | null;
  lockedSource?: string | null;
  /** 当前生效的汇率（调用方按需查询），没有则传 null */
  current?: FxQuote | null;
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const upper = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

/**
 * 解析一个方案该用哪条汇率。
 * 优先级：方案锁定值 > 当前生效值 > 缺失。
 * 锁定值优先，是为了让「上个月算出来的数字，今天打开还是同一个数」。
 */
export function resolveFx(input: FxResolveInput): FxResolution {
  const base = upper(input.costCurrency);
  const quote = upper(input.currency);

  // 没填成本币种 = 与售价币种相同；老数据走这一支，行为完全不变
  if (!base || !quote || base === quote) {
    return {
      needed: false,
      rate: 1,
      asOf: null,
      source: "",
      locked: false,
      missing: false,
      base: quote || base,
      quote: quote || base,
    };
  }

  const lockedRate = Number(input.lockedRate ?? 0);
  if (Number.isFinite(lockedRate) && lockedRate > 0) {
    return {
      needed: true,
      rate: lockedRate,
      asOf: iso(input.lockedAsOf),
      source: input.lockedSource ?? "",
      locked: true,
      missing: false,
      base,
      quote,
    };
  }

  const current = input.current;
  if (current && Number.isFinite(current.rate) && current.rate > 0) {
    return {
      needed: true,
      rate: current.rate,
      asOf: iso(current.asOf),
      source: current.source,
      locked: false,
      missing: false,
      base,
      quote,
    };
  }

  return {
    needed: true,
    rate: 1,
    asOf: null,
    source: "",
    locked: false,
    missing: true,
    base,
    quote,
  };
}

/** 从一组汇率里挑出某货币对的最新一条（不同货币对互不影响） */
export function pickQuote(quotes: readonly FxQuote[], base: string, quote: string): FxQuote | null {
  const b = upper(base);
  const q = upper(quote);
  let best: FxQuote | null = null;
  for (const item of quotes) {
    if (upper(item.base) !== b || upper(item.quote) !== q) continue;
    if (!best || (item.asOf ?? "") > (best.asOf ?? "")) best = item;
  }
  return best;
}

/**
 * 补齐反向汇率（内存镜像，不写库）。
 *
 * 只拉了 CNY→USD 就用不了 USD→CNY，等于逼用户为每个方向各拉一次。
 * 反算是数学恒等变换，不需要历史记录，但要在 source 上标明「反向推算」，
 * 免得把推算值当成采集值。
 *
 * 已有的真实货币对优先：先登记 key，只补不存在的方向。
 */
export function withInverseQuotes(quotes: readonly FxQuote[]): FxQuote[] {
  const keys = new Set(quotes.map((q) => `${upper(q.base)}/${upper(q.quote)}`));
  const out: FxQuote[] = [...quotes];
  for (const q of quotes) {
    const base = upper(q.base);
    const quote = upper(q.quote);
    const inverseKey = `${quote}/${base}`;
    if (keys.has(inverseKey) || !(q.rate > 0) || base === quote) continue;
    out.push({
      base: quote,
      quote: base,
      rate: 1 / q.rate,
      asOf: q.asOf,
      source: `${q.source}（反向推算）`,
    });
    keys.add(inverseKey);
  }
  return out;
}

/** 展示用：1 CNY = 0.140800 USD，去掉无意义的尾零 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  if (rate >= 1000) return rate.toFixed(0);
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return rate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

/** 币种输入校验：三位字母，统一大写 */
export function normalizeCurrency(value: string | null | undefined): string {
  return upper(value);
}

export function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

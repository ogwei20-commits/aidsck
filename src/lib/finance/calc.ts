/**
 * 财务计算（纯函数，无数据库、无 server-only）。
 *
 * 抽到 lib 层的原因：同一套口径要同时被三处使用——服务端快照、页面结果卡片、
 * 多售价对比组件（客户端实时重算）。口径只能有一份，复制三份必然漂移。
 *
 * 固定口径（文档 7.6）：
 *   单件总成本 = 采购 + 运费 + 单件广告 + 单件其他 + 售价 ×(佣金率 + 支付费率)
 *   单件净利   = 售价 − 单件总成本
 *   盈亏平衡单量 = ceil(固定投入 / 单件净利)，固定投入为 0 或净利非正时不下结论
 */

export interface FinanceInput {
  sellPrice: number;
  purchaseCost: number;
  shippingCost: number;
  commissionRate: number;
  paymentRate: number;
  adCost: number;
  otherCost: number;
  fixedCost: number;
  expectedOrders: number;
  currency: string;
  name: string;
}

export interface FinanceSnapshot {
  name: string;
  sellPrice: number;
  unitCost: number;
  unitProfit: number;
  margin: number;
  currency: string;
  breakEvenUnits: number;
}

/** 四舍五入到 4 位，和数据库 numeric(12,4) 保持一致，避免浮点尾巴 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 佣金 + 支付费率合计（小数，如 0.179） */
export function rateSum(i: Pick<FinanceInput, "commissionRate" | "paymentRate">): number {
  return (i.commissionRate + i.paymentRate) / 100;
}

/** 与售价无关的那部分单件成本：采购 + 运费 + 广告 + 单件其他 */
export function fixedUnitCost(
  i: Pick<FinanceInput, "purchaseCost" | "shippingCost" | "adCost" | "otherCost">,
): number {
  return i.purchaseCost + i.shippingCost + i.adCost + i.otherCost;
}

export function computeFinance(i: FinanceInput): FinanceSnapshot & { monthlyProfit: number } {
  const r = rateSum(i);
  const unitCost = round4(fixedUnitCost(i) + i.sellPrice * r);
  const unitProfit = round4(i.sellPrice - unitCost);
  const margin = i.sellPrice > 0 ? (unitProfit / i.sellPrice) * 100 : 0;
  const breakEvenUnits = unitProfit > 0 && i.fixedCost > 0 ? Math.ceil(i.fixedCost / unitProfit) : 0;
  return {
    name: i.name,
    sellPrice: i.sellPrice,
    unitCost,
    unitProfit,
    margin,
    currency: i.currency,
    breakEvenUnits,
    monthlyProfit: round4(unitProfit * i.expectedOrders - i.fixedCost),
  };
}

/**
 * 每涨 1 元售价，净利增加多少。
 * 不等于 1：佣金与支付费按售价抽成，涨价的一部分会被平台拿走。
 * 这个数字是定价决策里最容易被忽略的一个。
 */
export function marginalProfitPerUnit(i: FinanceInput): number {
  return round4(1 - rateSum(i));
}

/**
 * 保本售价：净利刚好为 0 的售价。
 * 解 p(1-r) = 固定单件成本 → p = c / (1-r)。
 * 低于这个价，卖得越多亏得越多。费率合计 ≥ 100% 时不存在（返回 null）。
 */
export function minViablePrice(i: FinanceInput): number | null {
  const r = rateSum(i);
  if (r >= 1) return null;
  const c = fixedUnitCost(i);
  if (c <= 0) return 0;
  return Math.ceil((c / (1 - r)) * 100) / 100;
}

export interface PriceLadderRow {
  price: number;
  unitCost: number;
  unitProfit: number;
  margin: number;
  /** 0 表示无法给出（净利非正或没填固定投入） */
  breakEvenUnits: number;
  monthlyProfit: number;
  /** 与当前方案输入价一致 */
  isBaseline: boolean;
  /** 净利为正 */
  isViable: boolean;
}

export interface PriceLadder {
  rows: PriceLadderRow[];
  /** 佣金 + 支付合计，百分比 */
  ratePercent: number;
  marginalPerUnit: number;
  minViablePrice: number | null;
  /** 月利润最高的档位；全部亏损时为 null */
  bestPrice: number | null;
}

/**
 * 多售价对比（文档 7.6 要求）。
 * 只改售价，其余输入不变——这样每一行的差异都只来自定价，
 * 混入别的变量就看不出是哪个因素在起作用。
 */
export function buildPriceLadder(input: FinanceInput, prices: number[]): PriceLadder {
  const clean = Array.from(
    new Set(prices.filter((p) => Number.isFinite(p) && p > 0).map((p) => Math.round(p * 100) / 100)),
  ).sort((a, b) => a - b);

  const rows: PriceLadderRow[] = clean.map((price) => {
    const r = computeFinance({ ...input, sellPrice: price });
    return {
      price,
      unitCost: r.unitCost,
      unitProfit: r.unitProfit,
      margin: r.margin,
      breakEvenUnits: r.breakEvenUnits,
      monthlyProfit: r.monthlyProfit,
      isBaseline: Math.abs(price - input.sellPrice) < 0.005,
      isViable: r.unitProfit > 0,
    };
  });

  const viable = rows.filter((r) => r.isViable);
  const best = viable.length > 0 ? viable.reduce((a, b) => (b.monthlyProfit > a.monthlyProfit ? b : a)) : null;

  return {
    rows,
    ratePercent: round4(rateSum(input) * 100),
    marginalPerUnit: marginalProfitPerUnit(input),
    minViablePrice: minViablePrice(input),
    bestPrice: best ? best.price : null,
  };
}

/**
 * 默认档位：围绕当前售价 ±5% / ±10% 共五档，并且**一定包含当前售价本身**。
 * 不含当前价的话，「当前」这一行标不出来，用户就分不清哪一行是他现在的方案。
 * 取整到人愿意写在价签上的数（低于 20 取 0.5，20 以上取整），
 * 与当前价过近的取整档直接丢掉，避免出现 19.9 和 20 并排。
 */
export function defaultLadderPrices(sellPrice: number): number[] {
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return [];
  const step = sellPrice < 20 ? 0.5 : 1;
  const snap = (v: number) => Math.max(step, Math.round(v / step) * step);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const neighbours = [0.9, 0.95, 1.05, 1.1]
    .map((k) => snap(sellPrice * k))
    .filter((v) => Math.abs(v - sellPrice) >= step * 0.6);

  return Array.from(new Set([...neighbours, round2(sellPrice)].map(round2))).sort((a, b) => a - b);
}

/**
 * 把一行原始数据适配成计算输入。
 *
 * 两种命名都要认：模块列表走 `listRows` 时已转成 camelCase（sellPrice），
 * 而演示脚本与直连 SQL 出来的是 snake_case（sell_price）。
 * 只认一种的后果不是报错，是**所有数字静默变成 0**——
 * 这一条踩过一次，所以用「按优先级取第一个能解析的值」而不是写死键名。
 */
export function parseFinanceRow(raw: Record<string, unknown>): FinanceInput {
  const num = (...keys: string[]) => {
    for (const key of keys) {
      const v = raw[key];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const v = raw[key];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };

  return {
    name: text("name"),
    currency: text("currency") || "USD",
    sellPrice: num("sellPrice", "sell_price"),
    purchaseCost: num("purchaseCost", "purchase_cost"),
    shippingCost: num("shippingCost", "shipping_cost"),
    commissionRate: num("commissionRate", "commission_rate"),
    paymentRate: num("paymentRate", "payment_rate"),
    adCost: num("adCost", "ad_cost"),
    otherCost: num("otherCost", "other_cost"),
    fixedCost: num("fixedCost", "fixed_cost"),
    expectedOrders: num("expectedOrders", "expected_orders"),
  };
}

import { describe, expect, it } from "vitest";
import {
  buildPriceLadder,
  computeFinance,
  costFactor,
  defaultLadderPrices,
  minViablePrice,
  parseFinanceRow,
  round4,
  type FinanceInput,
} from "@/lib/finance/calc";

const base: FinanceInput = {
  name: "冻干零食",
  currency: "USD",
  sellPrice: 19.9,
  purchaseCost: 100,
  shippingCost: 0,
  commissionRate: 0,
  paymentRate: 0,
  adCost: 0,
  otherCost: 0,
  fixedCost: 2000,
  expectedOrders: 100,
};

describe("财务计算 · 成本币种折算", () => {
  it("没有成本币种时完全不折算（老数据零影响）", () => {
    expect(costFactor(base)).toBe(1);
    const r = computeFinance(base);
    expect(r.unitCost).toBe(100);
    expect(r.unitProfit).toBe(-80.1);
  });

  it("成本与固定投入都按汇率折算，分子分母同单位", () => {
    const input = { ...base, costCurrency: "CNY", fxRate: 0.1408 };
    expect(round4(costFactor(input) * 100)).toBe(14.08);
    const r = computeFinance(input);
    expect(r.unitCost).toBe(14.08);
    expect(r.unitProfit).toBe(5.82);
    // 2000 CNY × 0.1408 = 281.6 USD；281.6 / 5.82 = 48.38 → 49 单
    expect(r.breakEvenUnits).toBe(49);
    expect(r.monthlyProfit).toBe(round4(5.82 * 100 - 281.6));
  });

  it("缺汇率时数字照算但显式标记不可信", () => {
    const r = computeFinance({ ...base, costCurrency: "CNY", fxMissing: true });
    expect(r.fxMissing).toBe(true);
    expect(r.unitCost).toBe(100);
  });

  it("保本售价也走同一折算口径，不出现两套公式", () => {
    expect(minViablePrice({ ...base, costCurrency: "CNY", fxRate: 0.1408 })).toBe(14.08);
    expect(minViablePrice(base)).toBe(100);
  });

  it("多售价阶梯用折算后的输入，五档都随成本变化", () => {
    const ladder = buildPriceLadder({ ...base, costCurrency: "CNY", fxRate: 0.1408 }, defaultLadderPrices(19.9));
    expect(ladder.rows.length).toBeGreaterThanOrEqual(3);
    expect(ladder.rows.every((row) => row.unitCost >= 14.08 - 0.001)).toBe(true);
    expect(ladder.minViablePrice).toBe(14.08);
  });

  it("parseFinanceRow 认 camelCase 与 snake_case 两种键名", () => {
    const camel = parseFinanceRow({ name: "A", currency: "USD", costCurrency: "CNY", fxRate: 0.1408 });
    const snake = parseFinanceRow({ name: "A", currency: "USD", cost_currency: "CNY", fx_rate: 0.1408 });
    expect(camel.costCurrency).toBe("CNY");
    expect(snake.costCurrency).toBe("CNY");
    expect(camel.fxRate).toBe(0.1408);
    expect(snake.fxRate).toBe(0.1408);
  });

  it("parseFinanceRow 缺汇率字段时按 0 处理，不会 NaN", () => {
    const r = parseFinanceRow({ name: "A" });
    expect(r.fxRate).toBe(0);
    expect(Number.isFinite(computeFinance(r).unitCost)).toBe(true);
  });
});

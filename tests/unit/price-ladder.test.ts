import { describe, expect, it } from "vitest";
import {
  buildPriceLadder,
  computeFinance,
  defaultLadderPrices,
  marginalProfitPerUnit,
  minViablePrice,
  parseFinanceRow,
  type FinanceInput,
} from "@/lib/finance/calc";

const base: FinanceInput = {
  name: "测试方案",
  currency: "USD",
  sellPrice: 19.9,
  purchaseCost: 6.2,
  shippingCost: 3.8,
  commissionRate: 15,
  paymentRate: 2.9,
  adCost: 2.5,
  otherCost: 1.0,
  fixedCost: 3000,
  expectedOrders: 600,
};

describe("默认档位", () => {
  it("五档，升序，且含当前售价", () => {
    const prices = defaultLadderPrices(19.9);
    expect(prices).toHaveLength(5);
    expect(prices).toContain(19.9);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("低于 20 的取整到 0.5，不至于出现 19.87 这种价签", () => {
    expect(defaultLadderPrices(19.9)).toEqual([18, 19, 19.9, 21, 22]);
  });

  it("20 以上取整到 1", () => {
    expect(defaultLadderPrices(100)).toEqual([90, 95, 100, 105, 110]);
  });

  it("与当前价过近的取整档被丢掉，不出现 19.9 和 20 并排", () => {
    const prices = defaultLadderPrices(19.9);
    expect(prices.filter((p) => Math.abs(p - 19.9) < 0.5)).toHaveLength(1);
  });

  it("非法售价不生成档位", () => {
    expect(defaultLadderPrices(0)).toEqual([]);
    expect(defaultLadderPrices(-5)).toEqual([]);
    expect(defaultLadderPrices(Number.NaN)).toEqual([]);
  });
});

describe("多售价对比", () => {
  it("每一行只改售价，成本随售价线性上升", () => {
    const ladder = buildPriceLadder(base, [15, 20, 25]);
    const costs = ladder.rows.map((r) => r.unitCost);
    expect(costs[1] - costs[0]).toBeCloseTo(5 * 0.179, 3);
    expect(costs[2] - costs[1]).toBeCloseTo(5 * 0.179, 3);
  });

  it("与单方案计算结果完全一致（同一口径，不是两套）", () => {
    const ladder = buildPriceLadder(base, [19.9]);
    const one = computeFinance(base);
    expect(ladder.rows[0].unitCost).toBe(one.unitCost);
    expect(ladder.rows[0].unitProfit).toBe(one.unitProfit);
    expect(ladder.rows[0].monthlyProfit).toBe(one.monthlyProfit);
    expect(ladder.rows[0].breakEvenUnits).toBe(one.breakEvenUnits);
  });

  it("亏损档位不给盈亏平衡单量", () => {
    const ladder = buildPriceLadder(base, [12]);
    expect(ladder.rows[0].isViable).toBe(false);
    expect(ladder.rows[0].breakEvenUnits).toBe(0);
  });

  it("标出月利润最高的档位", () => {
    const ladder = buildPriceLadder(base, [15, 20, 25, 30]);
    expect(ladder.bestPrice).toBe(30);
  });

  it("全部亏损时没有最优档", () => {
    const ladder = buildPriceLadder({ ...base, purchaseCost: 50 }, [10, 12]);
    expect(ladder.bestPrice).toBeNull();
    expect(ladder.rows.every((r) => !r.isViable)).toBe(true);
  });

  it("基准价那一行被标出来", () => {
    const ladder = buildPriceLadder(base, [18, 19.9, 22]);
    expect(ladder.rows.filter((r) => r.isBaseline)).toHaveLength(1);
    expect(ladder.rows.find((r) => r.isBaseline)?.price).toBe(19.9);
  });

  it("非法与重复价格被过滤，且结果有序", () => {
    const ladder = buildPriceLadder(base, [20, 0, -3, 20, Number.NaN, 18]);
    expect(ladder.rows.map((r) => r.price)).toEqual([18, 20]);
  });
});

describe("两个定价结论数字", () => {
  it("每涨 1 元净利只增 (1 − 费率合计)", () => {
    expect(marginalProfitPerUnit(base)).toBeCloseTo(0.821, 4);
  });

  it("保本售价代回去净利刚好不为负，再低一点就亏", () => {
    const p = minViablePrice(base);
    expect(p).not.toBeNull();
    const at = computeFinance({ ...base, sellPrice: p as number });
    expect(at.unitProfit).toBeGreaterThanOrEqual(0);
    const below = computeFinance({ ...base, sellPrice: (p as number) - 0.01 });
    expect(below.unitProfit).toBeLessThan(0);
  });

  it("费率合计达到 100% 时不存在保本售价", () => {
    expect(minViablePrice({ ...base, commissionRate: 90, paymentRate: 10 })).toBeNull();
  });

  it("与售价无关的成本为 0 时，任意正价都不亏", () => {
    expect(
      minViablePrice({ ...base, purchaseCost: 0, shippingCost: 0, adCost: 0, otherCost: 0 }),
    ).toBe(0);
  });

  it("对比结果里带上费率合计，页面不用自己再算一遍", () => {
    const ladder = buildPriceLadder(base, [19.9]);
    expect(ladder.ratePercent).toBeCloseTo(17.9, 4);
    expect(ladder.marginalPerUnit).toBeCloseTo(0.821, 4);
  });
});

describe("原始行适配", () => {
  it("snake_case 行能直接算，缺字段按 0", () => {
    const input = parseFinanceRow({
      name: "方案A",
      currency: "USD",
      sell_price: "19.9",
      purchase_cost: 6.2,
      commission_rate: 15,
      payment_rate: 2.9,
      fixed_cost: 3000,
      expected_orders: 600,
    });
    expect(input.sellPrice).toBe(19.9);
    expect(input.shippingCost).toBe(0);
    expect(computeFinance(input).unitProfit).toBeCloseTo(19.9 - (6.2 + 19.9 * 0.179), 4);
  });

  // 回归：模块列表走 listRows 会转成 camelCase。只认 snake_case 时
  // 页面上所有财务数字静默变成 0，而且不报错、不抛异常，很难发现。
  it("camelCase 行（listRows 的实际形状）也能算，数字不能全是 0", () => {
    const input = parseFinanceRow({
      id: "6b052ee9",
      name: "[演示] 冻干鸡胸肉零食 · 19.9 美元档",
      currency: "USD",
      sellPrice: "19.9000",
      purchaseCost: "6.2000",
      shippingCost: "3.8000",
      commissionRate: "15.00000000",
      paymentRate: "2.90000000",
      adCost: "2.5000",
      otherCost: "1.0000",
      fixedCost: "3000.0000",
      expectedOrders: 600,
    });
    expect(input.sellPrice).toBe(19.9);
    expect(input.purchaseCost).toBe(6.2);
    expect(input.fixedCost).toBe(3000);
    const r = computeFinance(input);
    expect(r.unitCost).toBeCloseTo(17.0621, 4);
    expect(r.unitProfit).toBeCloseTo(2.8379, 4);
    expect(r.breakEvenUnits).toBe(1058);
  });

  it("脏数据不会算出 NaN", () => {
    const input = parseFinanceRow({ sell_price: "abc", purchase_cost: null });
    expect(Number.isFinite(computeFinance(input).unitCost)).toBe(true);
  });
});

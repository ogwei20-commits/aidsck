import { describe, expect, it } from "vitest";
import { computeFinance } from "@/server/services/dashboard";

const base = {
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

describe("财务口径", () => {
  it("单件总成本包含按售价计算的佣金与支付费", () => {
    const r = computeFinance(base);
    // 6.2 + 3.8 + 2.5 + 1.0 + 19.9 × 17.9%
    expect(r.unitCost).toBeCloseTo(17.0621, 4);
  });

  it("单件净利 = 售价 − 单件总成本", () => {
    const r = computeFinance(base);
    expect(r.unitProfit).toBeCloseTo(2.8379, 4);
    expect(r.margin).toBeCloseTo(14.26, 2);
  });

  it("盈亏平衡单量用固定投入作分子，并向上取整", () => {
    const r = computeFinance(base);
    expect(r.breakEvenUnits).toBe(1058);
  });

  it("固定投入为 0 时不给盈亏平衡结论，而不是返回 0 单", () => {
    const r = computeFinance({ ...base, fixedCost: 0 });
    expect(r.breakEvenUnits).toBe(0);
  });

  it("单件净利为负时不给盈亏平衡点", () => {
    const r = computeFinance({ ...base, sellPrice: 10 });
    expect(r.unitProfit).toBeLessThan(0);
    expect(r.breakEvenUnits).toBe(0);
  });

  it("月度利润扣除固定投入", () => {
    const r = computeFinance(base);
    expect(r.monthlyProfit).toBeCloseTo(2.8379 * 600 - 3000, 2);
  });
});

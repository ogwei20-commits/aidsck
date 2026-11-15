import { describe, expect, it } from "vitest";
import { formatRate, isValidCurrency, normalizeCurrency, pickQuote, resolveFx, withInverseQuotes, type FxQuote } from "@/lib/finance/fx";

const quotes: FxQuote[] = [
  { base: "CNY", quote: "USD", rate: 0.14, asOf: "2026-11-01T00:00:00.000Z", source: "manual" },
  { base: "CNY", quote: "USD", rate: 0.1408, asOf: "2026-11-15T00:00:00.000Z", source: "exchangerate-api" },
  { base: "USD", quote: "CNY", rate: 7.1, asOf: "2026-11-15T00:00:00.000Z", source: "exchangerate-api" },
];

describe("汇率解析", () => {
  it("成本币种留空或与售价相同时不折算，老方案行为不变", () => {
    expect(resolveFx({ currency: "USD" }).needed).toBe(false);
    expect(resolveFx({ costCurrency: "usd", currency: "USD" }).needed).toBe(false);
    expect(resolveFx({ costCurrency: "CNY", currency: "USD" }).needed).toBe(true);
  });

  it("锁定值优先于当前汇率——上个月的账今天打开还是同一个数", () => {
    const r = resolveFx({
      costCurrency: "CNY",
      currency: "USD",
      lockedRate: 0.13,
      lockedAsOf: "2026-10-01T00:00:00.000Z",
      lockedSource: "manual",
      current: quotes[1],
    });
    expect(r.locked).toBe(true);
    expect(r.rate).toBe(0.13);
    expect(r.asOf).toContain("2026-10-01");
  });

  it("没锁定就用当前生效汇率，并带上日期与来源", () => {
    const r = resolveFx({ costCurrency: "CNY", currency: "USD", current: pickQuote(quotes, "CNY", "USD") });
    expect(r.locked).toBe(false);
    expect(r.rate).toBe(0.1408);
    expect(r.source).toBe("exchangerate-api");
  });

  it("需要折算但查不到汇率：显式标 missing，不静默按 1:1 算", () => {
    const r = resolveFx({ costCurrency: "CNY", currency: "USD" });
    expect(r.missing).toBe(true);
    expect(r.rate).toBe(1);
    expect(r.needed).toBe(true);
  });

  it("pickQuote 只在同一货币对里取最新，不串到反向对", () => {
    expect(pickQuote(quotes, "cny", "usd")?.rate).toBe(0.1408);
    expect(pickQuote(quotes, "USD", "CNY")?.rate).toBe(7.1);
    expect(pickQuote(quotes, "CNY", "EUR")).toBeNull();
  });

  it("反向汇率为缺失方向补镜像，真实记录优先不被覆盖", () => {
    const onlyCnyUsd = withInverseQuotes([quotes[1]]);
    const back = pickQuote(onlyCnyUsd, "USD", "CNY");
    expect(back?.rate).toBeCloseTo(1 / 0.1408, 8);
    expect(back?.source).toContain("反向推算");
    expect(back?.asOf).toBe(quotes[1].asOf);

    // 库里已有真实的 USD→CNY 时，不能用反算值盖掉
    const all = withInverseQuotes(quotes);
    expect(pickQuote(all, "USD", "CNY")?.rate).toBe(7.1);
    expect(pickQuote(all, "USD", "CNY")?.source).toBe("exchangerate-api");
  });

  it("formatRate 去掉无意义尾零，不把 0.1408 显示成 0.14080000", () => {
    expect(formatRate(0.1408)).toBe("0.1408");
    expect(formatRate(7.1234)).toBe("7.1234");
    expect(formatRate(1)).toBe("1");
    expect(formatRate(1500)).toBe("1500");
    expect(formatRate(0)).toBe("—");
  });

  it("币种代码统一大写，只接受三位字母", () => {
    expect(normalizeCurrency(" cny ")).toBe("CNY");
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("US")).toBe(false);
    expect(isValidCurrency("U1D")).toBe(false);
  });
});

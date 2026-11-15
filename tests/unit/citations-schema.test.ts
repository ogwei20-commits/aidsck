import { describe, expect, it } from "vitest";
import {
  calculateFinanceSchema,
  citationUrlSchema,
  createCitationSchema,
} from "@/lib/validation/schemas";

describe("证据关联输入校验", () => {
  const base = {
    reportId: "11111111-1111-4111-8111-111111111111",
    sourceTitle: "Amazon Best Sellers · Home & Kitchen",
  };

  it("合法来源自动补默认值", () => {
    const parsed = createCitationSchema.parse(base);
    expect(parsed).toMatchObject({ ...base, sourceUrl: "", quote: "", dataType: "U" });
  });

  it("只接受 http/https 链接", () => {
    expect(citationUrlSchema.safeParse("https://example.com/a?b=1").success).toBe(true);
    expect(citationUrlSchema.safeParse("http://example.com").success).toBe(true);
    // 导出文件会被带到别的机器打开，这两种协议等于注入面
    expect(citationUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(citationUrlSchema.safeParse("data:text/html,<script>").success).toBe(false);
    expect(citationUrlSchema.safeParse("ftp://example.com").success).toBe(false);
  });

  it("允许无链接的线下来源", () => {
    expect(createCitationSchema.safeParse({ ...base, sourceUrl: "" }).success).toBe(true);
  });

  it("拒绝过短来源名与超长引文", () => {
    expect(createCitationSchema.safeParse({ ...base, sourceTitle: "x" }).success).toBe(false);
    expect(createCitationSchema.safeParse({ ...base, quote: "x".repeat(2001) }).success).toBe(false);
  });

  it("reportId 必须是 UUID", () => {
    expect(createCitationSchema.safeParse({ ...base, reportId: "abc" }).success).toBe(false);
  });

  it("只接受 R/E/P/S/U", () => {
    expect(createCitationSchema.safeParse({ ...base, dataType: "R" }).success).toBe(true);
    expect(createCitationSchema.safeParse({ ...base, dataType: "Z" }).success).toBe(false);
  });
});

describe("财务计算接口输入校验", () => {
  it("缺省值全部按 0 处理，不因少传字段而报错", () => {
    const parsed = calculateFinanceSchema.parse({});
    expect(parsed).toMatchObject({
      sellPrice: 0,
      purchaseCost: 0,
      commissionRate: 0,
      paymentRate: 0,
      currency: "USD",
      expectedOrders: 0,
    });
  });

  it("费率超过 100% 被拒绝", () => {
    expect(calculateFinanceSchema.safeParse({ commissionRate: 101 }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ paymentRate: 8.5 }).success).toBe(true);
  });

  it("金额不能为负，也不能是 NaN/Infinity", () => {
    expect(calculateFinanceSchema.safeParse({ purchaseCost: -1 }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ purchaseCost: Number.NaN }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ purchaseCost: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("单量必须是非负整数", () => {
    expect(calculateFinanceSchema.safeParse({ expectedOrders: 12.5 }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ expectedOrders: -3 }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ expectedOrders: 1200 }).success).toBe(true);
  });

  it("自定义档位最多 9 个且必须为正数", () => {
    expect(calculateFinanceSchema.safeParse({ prices: [9.9, 10.9] }).success).toBe(true);
    expect(calculateFinanceSchema.safeParse({ prices: [0] }).success).toBe(false);
    expect(calculateFinanceSchema.safeParse({ prices: new Array(10).fill(10) }).success).toBe(false);
  });
});

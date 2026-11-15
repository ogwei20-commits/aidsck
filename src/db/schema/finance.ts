import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns, money, rate, sharedColumns } from "./shared";
import { products, platforms } from "./research";

/**
 * 文档 4.2「财务模拟」四张表。
 * 所有金额列使用 numeric(18,4)；汇率使用 numeric(18,8) 并保留历史，不覆盖旧值。
 */

export const currencyRates = pgTable(
  "currency_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: rate("rate").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("manual"),
    dataType: text("data_type").notNull().default("U"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("currency_rates_pair_idx").on(t.baseCurrency, t.quoteCurrency, t.effectiveAt)],
);

export const financeScenarios = pgTable(
  "finance_scenarios",
  {
    ...baseColumns,
    name: text("name").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    currency: text("currency").notNull().default("USD"),
    /**
     * 成本币种。空字符串表示「与售价币种相同」——老数据因此不需要回填，
     * 也不会因为新加一列就突然按汇率折算。
     */
    costCurrency: text("cost_currency").notNull().default(""),
    /** 锁定汇率：1 单位成本币种 = fx_rate 单位售价币种。0 表示未锁定，按当前汇率试算 */
    fxRate: rate("fx_rate").notNull().default("0"),
    fxAsOf: timestamp("fx_as_of", { withTimezone: true }),
    fxSource: text("fx_source").notNull().default(""),
    sellPrice: money("sell_price").notNull().default("0"),
    purchaseCost: money("purchase_cost").notNull().default("0"),
    shippingCost: money("shipping_cost").notNull().default("0"),
    commissionRate: rate("commission_rate").notNull().default("0"),
    paymentRate: rate("payment_rate").notNull().default("0"),
    adCost: money("ad_cost").notNull().default("0"),
    otherCost: money("other_cost").notNull().default("0"),
    /**
     * 固定投入：不随单量变化的钱（商标、检测认证、平台年费、首批模具等）。
     * 盈亏平衡点必须用它作分子，不能用单件费用冒充。
     */
    fixedCost: money("fixed_cost").notNull().default("0"),
    expectedOrders: integer("expected_orders").notNull().default(0),
    /** 每次计算的结果快照，便于对比不同售价情景 */
    result: text("result").notNull().default(""),
    assumption: text("assumption").notNull().default(""),
  },
  (t) => [index("finance_scenarios_user_idx").on(t.userId)],
);

export const productCosts = pgTable(
  "product_costs",
  {
    ...baseColumns,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    costType: text("cost_type").notNull(),
    amount: money("amount").notNull().default("0"),
    currency: text("currency").notNull().default("CNY"),
    note: text("note").notNull().default(""),
  },
  (t) => [index("product_costs_product_idx").on(t.productId)],
);

export const profitCalculations = pgTable(
  "profit_calculations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    scenarioId: uuid("scenario_id").references(() => financeScenarios.id, { onDelete: "cascade" }),
    unitCost: money("unit_cost").notNull().default("0"),
    unitProfit: money("unit_profit").notNull().default("0"),
    marginRate: rate("margin_rate").notNull().default("0"),
    breakEvenUnits: integer("break_even_units").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** 计算假设必须随结果一起保存，否则无法复现 */
    assumption: text("assumption").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("profit_calculations_user_idx").on(t.userId, t.createdAt)],
);

/** 平台费率等基准数据，供财务模拟默认值使用 */
export const financeBaselines = pgTable("finance_baselines", {
  ...sharedColumns,
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  value: money("value").notNull().default("0"),
  unit: text("unit").notNull().default(""),
  note: text("note").notNull().default(""),
});

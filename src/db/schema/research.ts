import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns, money, rate, sharedColumns, titleColumn } from "./shared";

/** 文档 4.2「市场和产品研究」七张表 */

export const researchProjects = pgTable(
  "research_projects",
  {
    ...baseColumns,
    title: titleColumn("title"),
    market: text("market").notNull().default(""),
    topic: text("topic").notNull().default(""),
    question: text("question").notNull().default(""),
    status: text("status").notNull().default("draft"),
    conclusion: text("conclusion").notNull().default(""),
    projectId: uuid("project_id"),
  },
  (t) => [index("research_projects_user_idx").on(t.userId, t.status)],
);

export const researchSources = pgTable(
  "research_sources",
  {
    ...baseColumns,
    researchId: uuid("research_id")
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    title: titleColumn("title"),
    url: text("url").notNull().default(""),
    publisher: text("publisher").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** 文档 9.3：外部内容一律视为不可信数据 */
    trustLevel: text("trust_level").notNull().default("medium"),
    excerpt: text("excerpt").notNull().default(""),
  },
  (t) => [index("research_sources_research_idx").on(t.researchId)],
);

export const researchFindings = pgTable(
  "research_findings",
  {
    ...baseColumns,
    researchId: uuid("research_id")
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    evidence: text("evidence").notNull().default(""),
    confidence: integer("confidence").notNull().default(50),
    sourceId: uuid("source_id").references(() => researchSources.id, { onDelete: "set null" }),
  },
  (t) => [index("research_findings_research_idx").on(t.researchId)],
);

export const platforms = pgTable("platforms", {
  ...sharedColumns,
  name: text("name").notNull(),
  region: text("region").notNull().default(""),
  category: text("category").notNull().default(""),
  /** 平台费率结构按比例存，不用金额列 */
  commissionRate: rate("commission_rate").notNull().default("0"),
  entryCost: money("entry_cost").notNull().default("0"),
  requirements: text("requirements").notNull().default(""),
  pros: text("pros").notNull().default(""),
  cons: text("cons").notNull().default(""),
  score: integer("score").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    ...baseColumns,
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    targetMarket: text("target_market").notNull().default(""),
    purchasePrice: money("purchase_price").notNull().default("0"),
    sellPrice: money("sell_price").notNull().default("0"),
    currency: text("currency").notNull().default("CNY"),
    monthlyDemand: integer("monthly_demand").notNull().default(0),
    competitionLevel: text("competition_level").notNull().default("medium"),
    score: integer("score").notNull().default(0),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("products_user_idx").on(t.userId, t.category)],
);

export const competitors = pgTable(
  "competitors",
  {
    ...baseColumns,
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform").notNull().default(""),
    price: money("price").notNull().default("0"),
    monthlySales: integer("monthly_sales").notNull().default(0),
    rating: rate("rating").notNull().default("0"),
    strengths: text("strengths").notNull().default(""),
    weaknesses: text("weaknesses").notNull().default(""),
  },
  (t) => [index("competitors_product_idx").on(t.productId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    ...baseColumns,
    name: text("name").notNull(),
    productCategory: text("product_category").notNull().default(""),
    contact: text("contact").notNull().default(""),
    location: text("location").notNull().default(""),
    minOrderQty: integer("min_order_qty").notNull().default(0),
    unitPrice: money("unit_price").notNull().default("0"),
    leadTimeDays: integer("lead_time_days").notNull().default(0),
    shippingMethod: text("shipping_method").notNull().default(""),
    shippingCost: money("shipping_cost").notNull().default("0"),
    rating: integer("rating").notNull().default(0),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("suppliers_user_idx").on(t.userId)],
);

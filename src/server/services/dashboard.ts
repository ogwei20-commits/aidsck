import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agents,
  auditLogs,
  financeScenarios,
  knowledgeItems,
  learningPlans,
  projects,
  reports,
  tasks,
  type AuditLogRow,
  type ProjectRow,
  type TaskRow,
} from "@/db/schema";

export interface FinanceSnapshot {
  name: string;
  sellPrice: number;
  unitCost: number;
  unitProfit: number;
  margin: number;
  currency: string;
  breakEvenUnits: number;
}

export interface DashboardData {
  pendingTasks: number;
  runningTasks: number;
  activeProjects: number;
  totalTasks: number;
  logCount: number;
  tasks: TaskRow[];
  projects: ProjectRow[];
  plans: (typeof learningPlans.$inferSelect)[];
  agentList: (typeof agents.$inferSelect)[];
  recentReports: (typeof reports.$inferSelect)[];
  recentKnowledge: (typeof knowledgeItems.$inferSelect)[];
  logs: AuditLogRow[];
  finance: FinanceSnapshot | null;
  lastActivityAt: Date | null;
}

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

/**
 * 财务口径（必须可复现，前后一致）：
 * 单件总成本 = 采购 + 运费 + 广告 + 单件其他 + 售价 ×(佣金率 + 支付费率)
 * 单件净利   = 售价 − 单件总成本
 * 盈亏平衡单量 = ceil(固定投入 / 单件净利)；固定投入为 0 或利润非正时不下结论（返回 0 并标明）
 */
export function computeFinance(i: FinanceInput): FinanceSnapshot & { monthlyProfit: number } {
  const rateSum = (i.commissionRate + i.paymentRate) / 100;
  const unitCost = i.purchaseCost + i.shippingCost + i.adCost + i.otherCost + i.sellPrice * rateSum;
  const unitProfit = i.sellPrice - unitCost;
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
    monthlyProfit: unitProfit * i.expectedOrders - i.fixedCost,
  };
}

export function computeSnapshot(row: typeof financeScenarios.$inferSelect) {
  return computeFinance({
    name: row.name,
    currency: row.currency,
    sellPrice: Number(row.sellPrice),
    purchaseCost: Number(row.purchaseCost),
    shippingCost: Number(row.shippingCost),
    commissionRate: Number(row.commissionRate),
    paymentRate: Number(row.paymentRate),
    adCost: Number(row.adCost),
    otherCost: Number(row.otherCost),
    fixedCost: Number(row.fixedCost),
    expectedOrders: row.expectedOrders,
  });
}

/** 通用模块列表返回的是 snake_case 原始行，这里做一次适配 */
export function computeFromRaw(raw: Record<string, unknown>) {
  const n = (key: string) => Number(raw[key] ?? 0);
  return computeFinance({
    name: String(raw.name ?? ""),
    currency: String(raw.currency ?? "USD"),
    sellPrice: n("sell_price"),
    purchaseCost: n("purchase_cost"),
    shippingCost: n("shipping_cost"),
    commissionRate: n("commission_rate"),
    paymentRate: n("payment_rate"),
    adCost: n("ad_cost"),
    otherCost: n("other_cost"),
    fixedCost: n("fixed_cost"),
    expectedOrders: n("expected_orders"),
  });
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const db = getDb();

  const [taskRows, projectRows, planRows, agentRows, reportRows, knowledgeRows, logRows, scenarioRows] =
    await Promise.all([
      db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.updatedAt)).limit(60),
      db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt)).limit(20),
      db.select().from(learningPlans).where(eq(learningPlans.userId, userId)).orderBy(desc(learningPlans.updatedAt)).limit(6),
      db.select().from(agents).orderBy(agents.role).limit(12),
      db.select().from(reports).where(eq(reports.userId, userId)).orderBy(desc(reports.updatedAt)).limit(4),
      db.select().from(knowledgeItems).where(eq(knowledgeItems.userId, userId)).orderBy(desc(knowledgeItems.updatedAt)).limit(4),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
      db.select().from(financeScenarios).where(eq(financeScenarios.userId, userId)).orderBy(desc(financeScenarios.updatedAt)).limit(1),
    ]);

  const [logCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs);

  const pendingTasks = taskRows.filter((t) => t.status === "pending").length;
  const runningTasks = taskRows.filter((t) => t.status === "running" || t.status === "review").length;
  const activeProjects = projectRows.filter((p) => p.status === "active").length;
  const lastActivityAt = logRows[0]?.createdAt ?? null;

  return {
    pendingTasks,
    runningTasks,
    activeProjects,
    totalTasks: taskRows.length,
    logCount: logCountRow?.n ?? 0,
    tasks: taskRows,
    projects: projectRows,
    plans: planRows,
    agentList: agentRows,
    recentReports: reportRows,
    recentKnowledge: knowledgeRows,
    logs: logRows,
    finance: scenarioRows[0] ? computeSnapshot(scenarioRows[0]) : null,
    lastActivityAt,
  };
}

/** Agent 最近执行次数，用于区分「注册了」和「真的跑过」 */
export async function getAgentRunCounts(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = (await db.execute(
    sql`select a.slug as slug, count(r.id)::int as n
        from agents a left join agent_runs r on r.agent_id = a.id
        group by a.slug`,
  )) as unknown as { slug: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.slug] = Number(r.n);
  return out;
}

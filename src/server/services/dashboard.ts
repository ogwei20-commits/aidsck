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
import {
  computeFinance,
  parseFinanceRow,
  type FinanceInput,
  type FinanceSnapshot,
} from "@/lib/finance/calc";

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

/**
 * 财务口径已抽到 `@/lib/finance/calc`：服务端快照、结果卡片、多售价对比
 * 三处共用一份实现，避免口径漂移。这里保留 re-export，旧引用不用改。
 */
export { computeFinance };
export type { FinanceInput, FinanceSnapshot };

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

/** 通用模块列表返回的是 snake_case 原始行，适配逻辑同样放在 calc 里 */
export function computeFromRaw(raw: Record<string, unknown>) {
  return computeFinance(parseFinanceRow(raw));
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

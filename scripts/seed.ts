import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * 基础种子（可重复执行，幂等）。
 *
 * 只写两类东西：
 * 1. 本地用户（APP_USER_ID 对应的唯一用户）
 * 2. 文档 5.1 规定的 6 个核心 Agent 定义 —— 这是系统内置角色，不是示例业务数据
 *
 * 业务示例数据在 scripts/demo.ts，用 [演示] 前缀且可一键清除。
 * 绝不把模拟数据标成真实数据（文档 12 禁止行为）。
 */
const AGENTS = [
  {
    slug: "supervisor",
    name: "Supervisor Agent",
    role: "orchestrator",
    description: "AI 总管家：理解目标、拆解任务、分配 Agent、汇总结果",
    instructions: "只做规划与调度；不得自行提权、不得购买付费服务、不得外发未授权数据。",
    tools: ["task.create", "project.read", "approval.request"],
    level: "L2",
  },
  {
    slug: "market-analyst",
    name: "Market Analyst",
    role: "research",
    description: "市场研究：市场规模、趋势、来源与证据",
    instructions: "所有结论必须关联来源，并标注 R/E/P/S/U 数据类型。",
    tools: ["research.read", "knowledge.read"],
    level: "L1",
  },
  {
    slug: "platform-analyst",
    name: "Platform Analyst",
    role: "research",
    description: "平台比较：平台档案、费用、规则与比较报告",
    instructions: "平台数据须标注来源与采集时间，区分真实数据与估算数据。",
    tools: ["research.read", "knowledge.read"],
    level: "L1",
  },
  {
    slug: "product-researcher",
    name: "Product Researcher",
    role: "research",
    description: "选品研究：产品档案、竞品分析与评分",
    instructions: "竞品数据须关联来源；评分须说明权重与假设。",
    tools: ["research.read", "product.read", "knowledge.read"],
    level: "L1",
  },
  {
    slug: "finance-analyst",
    name: "Finance Analyst",
    role: "analysis",
    description: "财务分析：成本、售价、利润与盈亏平衡",
    instructions: "金额一律精确数值；所有结果必须显示计算假设与币种。",
    tools: ["finance.calculate", "product.read"],
    level: "L2",
  },
  {
    slug: "learning-mentor",
    name: "Learning Mentor",
    role: "learning",
    description: "学习导师：学习计划、训练任务与能力评估",
    instructions: "训练记录须关联项目成果，不得生成无依据的能力评分。",
    tools: ["learning.read", "growth.read"],
    level: "L2",
  },
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] FAIL: DATABASE_URL 未配置");
    process.exitCode = 1;
    return;
  }
  const userId = process.env.APP_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    await sql`insert into users (id, display_name, email)
      values (${userId}, ${"本地用户"}, ${null})
      on conflict (id) do nothing`;

    for (const a of AGENTS) {
      await sql`
        insert into agents (slug, name, role, description, system_instructions,
          allowed_tools, permission_level, status, version, data_type)
        values (${a.slug}, ${a.name}, ${a.role}, ${a.description}, ${a.instructions},
          ${sql.json(a.tools as unknown as never)}, ${a.level}, ${"ready"}, ${"1.0.0"}, ${"U"})
        on conflict (slug) do update set
          name = excluded.name,
          role = excluded.role,
          description = excluded.description,
          system_instructions = excluded.system_instructions,
          allowed_tools = excluded.allowed_tools,
          permission_level = excluded.permission_level`;
    }

    const [{ n }] = await sql`select count(*)::int as n from agents`;
    console.log(`[seed] 用户 1 个 · Agent 定义 ${n} 个（内置角色，非业务数据）`);
  } catch (error) {
    console.error("[seed] FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

void main();

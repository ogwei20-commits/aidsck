import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMessages, agentRuns, agents, tasks } from "@/db/schema";
import { AppError } from "@/lib/errors/api";

/**
 * 执行记录（agent_runs / agent_messages）的读取层。
 *
 * 为什么单独做一层，而不是在页面里直接查：
 * 1. 「模式」不能直接读 provider 字段。provider 是**调用时的 Provider 标识**，
 *    而真正决定这次产出算不算数的，是 executor 里的 `mode`：
 *    没接模型时 mode=framework（内置模板，不含结论），接 mock 时 mode=mock，
 *    只有真模型才是 mode=model。二者映射关系固定，写在一处才不会前后不一致。
 * 2. 「这是该任务第几次执行」需要按任务分组计数。续跑之后同一个任务下会有
 *    失败一次 + 成功一次，不标出来就看不明白。
 */

/** 本次执行的实际产出方式。none = 没有产出，不是一种产出方式 */
export type RunMode = "framework" | "mock" | "model" | "none";

/**
 * provider 字段 → 实际产出模式。
 *
 * 依据 executor：`provider: getProviderStatus().mode` 在调用前落库，
 * 而 `mode` 由「有没有 provider」「provider.isReal」决定。
 * 未知值一律按真实模型处理——这是保守方向：宁可让人去核实，也不把真模型产出说成模板。
 */
export function modeOf(provider: string, hasOutput = true): RunMode {
  // 没有产出就谈不上「用哪种方式产出」。执行在写产出之前就失败时，
  // provider 字段已经有值（它记录的是「准备用哪个 Provider」），
  // 直接按 provider 标成「模拟输出」会让人以为它真的产出了东西。
  if (!hasOutput) return "none";
  if (provider === "none") return "framework";
  if (provider === "mock") return "mock";
  return "model";
}

export const RUN_MODE_LABEL: Record<RunMode, string> = {
  framework: "框架模板",
  mock: "模拟输出",
  model: "真实模型",
  none: "无产出",
};

/** 一句话解释每种模式产出的是什么，页面直接用它，不在组件里再写一遍 */
export const RUN_MODE_NOTE: Record<RunMode, string> = {
  framework: "未接模型，产出内置研究框架，不含结论、不计费",
  mock: "走本地模拟 Provider，用于验证调用链路，不得作为结论",
  model: "真实模型生成，结论仍需人工核验来源",
  none: "这次执行没有产出，产不出任何可用的东西",
};

export interface RunSummary {
  id: string;
  agentName: string;
  agentSlug: string;
  agentPermission: string;
  taskId: string | null;
  taskTitle: string | null;
  /** user 手动派活 / workflow 工作流节点触发 */
  taskSource: string | null;
  status: string;
  mode: RunMode;
  provider: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** 毫秒。框架模式同样有真实耗时（模板渲染也要时间），只是短 */
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  /** 产出字符数，用于判断这次执行到底有没有东西 */
  outputChars: number;
  /** 产出开头，列表里不展开也能看出大概 */
  outputPreview: string | null;
  /** 该任务下第几次执行（续跑会让同一步跑多次） */
  attemptNo: number;
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  framework: number;
  mock: number;
  model: number;
  /** 产出总字符数。比「总 token」更能说明这套系统目前到底产出了多少东西 */
  outputChars: number;
  /** 只统计真实模型那次调用的 token；没接模型时恒为 0，页面上要说明 */
  totalTokens: number;
}

export interface RunCenter {
  stats: RunStats;
  runs: RunSummary[];
  /** 当前实际模式，用于页面顶部说明「你现在看到的是什么」 */
  currentMode: string;
  /** 当前筛选命中的总数；无筛选时等于 stats.total */
  filteredTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: RunQuery;
  /** 全量出现过的 Agent，供筛选下拉使用（不受当前页影响） */
  agents: { slug: string; name: string; count: number }[];
}

/**
 * 筛选条件。
 *
 * 为什么筛选放服务端：执行记录会随使用一直增长，
 * 客户端筛选只能筛「已经取回来的 50 条」，数字对不上，翻页还会漏。
 */
export interface RunQuery {
  q: string;
  /** all / framework / mock / model / none */
  mode: string;
  /** all / succeeded / failed / running */
  status: string;
  /** Agent slug，空串表示全部 */
  agent: string;
}

export const EMPTY_RUN_QUERY: RunQuery = { q: "", mode: "all", status: "all", agent: "" };

export interface RunCenterOptions extends Partial<RunQuery> {
  page?: number;
  pageSize?: number;
}

/**
 * LIKE 通配符转义。
 * 不转义的话，搜 `%` 会命中全部记录、搜 `_` 会变成任意单字符——
 * 用户看到的是「搜了但结果不对」，排查起来非常费时间。
 */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

type RunRow = Omit<RunSummary, "mode"> & { provider: string };

const OUTPUT_PREVIEW_CHARS = 160;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * 执行记录中心：全量统计 + 最近若干条明细。
 *
 * 统计走一次聚合，明细走一次联查；两者分开算，避免「明细只取 50 条、
 * 统计却按 50 条算」这种把总数说小的问题。
 */
export async function listRunCenter(userId: string, options: RunCenterOptions = {}): Promise<RunCenter> {
  const db = getDb();

  const query: RunQuery = {
    q: (options.q ?? "").trim().slice(0, 100),
    mode: options.mode ?? "all",
    status: options.status ?? "all",
    agent: options.agent ?? "",
  };
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const requestedPage = Math.max(options.page ?? 1, 1);

  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${agentRuns.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')::int`,
      running: sql<number>`count(*) filter (where ${agentRuns.status} in ('running', 'queued'))::int`,
      // 三种产出方式只统计成功的执行：失败的那些没有产出，
      // 算进「模拟输出 / 框架模板」会让分类之和大于实际产出次数
      framework: sql<number>`count(*) filter (where ${agentRuns.provider} = 'none' and ${agentRuns.status} = 'succeeded')::int`,
      mock: sql<number>`count(*) filter (where ${agentRuns.provider} = 'mock' and ${agentRuns.status} = 'succeeded')::int`,
      model: sql<number>`count(*) filter (where ${agentRuns.provider} not in ('none', 'mock') and ${agentRuns.status} = 'succeeded')::int`,
      // ⚠ 这里必须写全表名 agent_runs.id，不能用 ${agentRuns.id}。
      // Drizzle 在带聚合函数的 select 里会把它渲染成裸 "id"，而子查询里的
      // agent_messages 也有 id 列，于是条件变成 m.run_id = m.id —— 恒为假、
      // 不报错、聚合结果静默变成 0。这个坑是测试断言具体字数时发现的。
      outputChars: sql<number>`coalesce(sum((
        select length(m.content) from agent_messages m
        where m.run_id = agent_runs.id and m.role = 'assistant'
        order by m.created_at desc limit 1
      )), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${agentRuns.inputTokens} + ${agentRuns.outputTokens}), 0)::int`,
    })
    .from(agentRuns)
    .where(eq(agentRuns.userId, userId));

  // ── 筛选条件 ────────────────────────────────────────────
  const conds: SQL[] = [eq(agentRuns.userId, userId)];

  if (query.q) {
    const like = `%${likeEscape(query.q)}%`;
    // 搜任务标题、Agent 名、失败原因。不搜产出正文：那要扫 agent_messages 全表，
    // 在这个阶段换来的收益不如「按任务定位」直接。
    const textCond = or(ilike(tasks.title, like), ilike(agents.name, like), ilike(agentRuns.error, like));
    if (textCond) conds.push(textCond);
  }

  if (query.status === "succeeded") conds.push(eq(agentRuns.status, "succeeded"));
  else if (query.status === "failed") conds.push(eq(agentRuns.status, "failed"));
  else if (query.status === "running") conds.push(sql`${agentRuns.status} in ('running', 'queued')`);

  if (query.mode === "framework") {
    conds.push(eq(agentRuns.provider, "none"), eq(agentRuns.status, "succeeded"));
  } else if (query.mode === "mock") {
    conds.push(eq(agentRuns.provider, "mock"), eq(agentRuns.status, "succeeded"));
  } else if (query.mode === "model") {
    conds.push(sql`${agentRuns.provider} not in ('none', 'mock')`, eq(agentRuns.status, "succeeded"));
  } else if (query.mode === "none") {
    // 「无产出」= 没成功。成功但没有 assistant 消息的记录在 executor 里不会出现，
    // 真出现了也应该按异常去查，而不是混进「无产出」的分组。
    conds.push(sql`${agentRuns.status} <> 'succeeded'`);
  }

  if (query.agent) conds.push(eq(agents.slug, query.agent));

  const where = and(...conds);

  // 数量要单独算：分页之后 rows.length 只是这一页的条数，
  // 用它当总数会让「共 N 条」随着翻页变化。
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(where);

  const filteredTotal = Number(countRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const rows = (await db
    .select({
      id: agentRuns.id,
      agentName: sql<string>`coalesce(${agents.name}, '已删除的 Agent')`,
      agentSlug: sql<string>`coalesce(${agents.slug}, '')`,
      agentPermission: sql<string>`coalesce(${agents.permissionLevel}, 'L1')`,
      taskId: agentRuns.taskId,
      taskTitle: tasks.title,
      taskSource: tasks.source,
      status: agentRuns.status,
      provider: agentRuns.provider,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      durationMs: sql<
        number | null
      >`case when ${agentRuns.startedAt} is null or ${agentRuns.finishedAt} is null then null
             else round(extract(epoch from (${agentRuns.finishedAt} - ${agentRuns.startedAt})) * 1000)::int end`,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      error: agentRuns.error,
      outputChars: sql<number>`coalesce((
        select length(m.content) from agent_messages m
        where m.run_id = ${agentRuns.id} and m.role = 'assistant'
        order by m.created_at desc limit 1
      ), 0)::int`,
      outputPreview: sql<
        string | null
      >`(select left(m.content, ${OUTPUT_PREVIEW_CHARS}) from agent_messages m
         where m.run_id = ${agentRuns.id} and m.role = 'assistant'
         order by m.created_at desc limit 1)`,
      /**
       * 「该任务第几次执行」必须全局算，不能按当前页的行号数。
       * 分页后同一任务的前几次可能在上一页，按页内序号会从 1 重新开始。
       */
      attemptNo: sql<number>`case when ${agentRuns.taskId} is null then 1 else (
        select count(*)::int from agent_runs r2
        where r2.task_id = ${agentRuns.taskId} and r2.created_at <= ${agentRuns.createdAt}
      ) end`,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(where)
    .orderBy(desc(agentRuns.createdAt))
    .limit(pageSize)
    .offset(offset)) as RunRow[];

  // Agent 筛选下拉：从全量记录里取，不受当前页与当前筛选影响，
  // 否则筛过一次之后就再也选不到别的 Agent 了。
  const agentRows = await db
    .select({
      slug: sql<string>`coalesce(${agents.slug}, '')`,
      name: sql<string>`coalesce(${agents.name}, '已删除的 Agent')`,
      count: sql<number>`count(*)::int`,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(eq(agentRuns.userId, userId))
    .groupBy(agents.slug, agents.name)
    .orderBy(sql`count(*) desc`);

  return {
    stats: {
      total: num(agg?.total),
      succeeded: num(agg?.succeeded),
      failed: num(agg?.failed),
      running: num(agg?.running),
      framework: num(agg?.framework),
      mock: num(agg?.mock),
      model: num(agg?.model),
      outputChars: num(agg?.outputChars),
      totalTokens: num(agg?.totalTokens),
    },
    runs: rows.map((row) => ({
      ...row,
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt),
      durationMs: row.durationMs === null ? null : num(row.durationMs),
      inputTokens: num(row.inputTokens),
      outputTokens: num(row.outputTokens),
      outputChars: num(row.outputChars),
      mode: modeOf(row.provider, num(row.outputChars) > 0),
      attemptNo: num(row.attemptNo) || 1,
    })),
    currentMode: process.env.AI_PROVIDER ?? "none",
    filteredTotal,
    page,
    pageSize,
    totalPages,
    query,
    agents: agentRows
      .filter((a) => a.slug !== "")
      .map((a) => ({ slug: a.slug, name: a.name, count: num(a.count) })),
  };
}

export interface RecentRun {
  id: string;
  agentName: string;
  taskId: string | null;
  taskTitle: string | null;
  /** 任务当前状态：首页据此显示「待你确认」，执行完的那条能直接收口 */
  taskStatus: string | null;
  status: string;
  mode: RunMode;
  startedAt: string | null;
  durationMs: number | null;
  outputChars: number;
  outputPreview: string | null;
  error: string | null;
}

/**
 * 首页用的「最近执行」：只取最近几条，不算全量统计。
 *
 * 不直接复用 listRunCenter 的原因：那边每次都要跑一次全表聚合，
 * 首页只是要四行结果，不该为了四行付一次全表扫描。
 * 摘要取 280 字——比执行记录页的 160 字长，因为首页没有列表列宽限制，
 * 多给两行能让人不点开也大致知道产出了什么。
 */
export async function listRecentRuns(userId: string, limit = 4): Promise<RecentRun[]> {
  const db = getDb();
  const rows = (await db
    .select({
      id: agentRuns.id,
      agentName: sql<string>`coalesce(${agents.name}, '已删除的 Agent')`,
      taskId: agentRuns.taskId,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      status: agentRuns.status,
      provider: agentRuns.provider,
      startedAt: agentRuns.startedAt,
      durationMs: sql<
        number | null
      >`case when ${agentRuns.startedAt} is null or ${agentRuns.finishedAt} is null then null
             else round(extract(epoch from (${agentRuns.finishedAt} - ${agentRuns.startedAt})) * 1000)::int end`,
      outputChars: sql<number>`coalesce((
        select length(m.content) from agent_messages m
        where m.run_id = ${agentRuns.id} and m.role = 'assistant'
        order by m.created_at desc limit 1
      ), 0)::int`,
      outputPreview: sql<
        string | null
      >`(select left(m.content, 280) from agent_messages m
         where m.run_id = ${agentRuns.id} and m.role = 'assistant'
         order by m.created_at desc limit 1)`,
      error: agentRuns.error,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(eq(agentRuns.userId, userId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 20))) as (Omit<RecentRun, "mode" | "startedAt" | "durationMs" | "outputChars"> & {
    provider: string;
    startedAt: Date | null;
    durationMs: number | null;
    outputChars: number;
  })[];

  return rows.map((row) => ({
    id: row.id,
    agentName: row.agentName,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    taskStatus: row.taskStatus,
    status: row.status,
    mode: modeOf(row.provider, num(row.outputChars) > 0),
    startedAt: iso(row.startedAt),
    durationMs: row.durationMs === null ? null : num(row.durationMs),
    outputChars: num(row.outputChars),
    outputPreview: row.outputPreview,
    error: row.error,
  }));
}

export interface RunMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface RunDetail extends RunSummary {
  messages: RunMessage[];
  /** 这次执行写进任务的日志，便于对照「执行时看到了什么」 */
  agentDescription: string | null;
  systemPrompt: string | null;
}

/**
 * 单次执行的完整记录：发给模型的输入与返回的产出。
 *
 * 这里没有做「只返回最近 N 条消息」的截断——一次执行就是一问一答，
 * 截断只会让人看不到全貌。
 */
export async function getRunDetail(userId: string, runId: string): Promise<RunDetail> {
  const db = getDb();

  const [row] = (await db
    .select({
      id: agentRuns.id,
      agentName: sql<string>`coalesce(${agents.name}, '已删除的 Agent')`,
      agentSlug: sql<string>`coalesce(${agents.slug}, '')`,
      agentPermission: sql<string>`coalesce(${agents.permissionLevel}, 'L1')`,
      agentDescription: agents.description,
      systemPrompt: agents.systemInstructions,
      taskId: agentRuns.taskId,
      taskTitle: tasks.title,
      taskSource: tasks.source,
      status: agentRuns.status,
      provider: agentRuns.provider,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      durationMs: sql<
        number | null
      >`case when ${agentRuns.startedAt} is null or ${agentRuns.finishedAt} is null then null
             else round(extract(epoch from (${agentRuns.finishedAt} - ${agentRuns.startedAt})) * 1000)::int end`,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      error: agentRuns.error,
      outputChars: sql<number>`0`,
      outputPreview: sql<string | null>`null`,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId)))
    .limit(1)) as (RunRow & { agentDescription: string | null; systemPrompt: string | null })[];

  if (!row) {
    throw new AppError("RUN_NOT_FOUND", "执行记录不存在或不属于当前用户", 404);
  }

  const messages = await db
    .select({
      id: agentMessages.id,
      role: agentMessages.role,
      content: agentMessages.content,
      createdAt: agentMessages.createdAt,
    })
    .from(agentMessages)
    .where(eq(agentMessages.runId, runId))
    .orderBy(agentMessages.createdAt);

  const assistant = [...messages].reverse().find((m) => m.role === "assistant");

  return {
    ...row,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs === null ? null : num(row.durationMs),
    inputTokens: num(row.inputTokens),
    outputTokens: num(row.outputTokens),
    mode: modeOf(row.provider, (assistant?.content.length ?? 0) > 0),
    attemptNo: 1,
    outputChars: assistant?.content.length ?? 0,
    outputPreview: assistant?.content.slice(0, OUTPUT_PREVIEW_CHARS) ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: iso(m.createdAt) ?? "",
    })),
  };
}

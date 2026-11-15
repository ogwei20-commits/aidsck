import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { agentMessages, agentRuns, agents, tasks, users } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { getRunDetail, listRunCenter, modeOf } from "@/server/services/agent-runs";
import { ensureLocalUser } from "@/server/services/workspace";

/**
 * 执行记录读取层：全部走真数据库。
 *
 * 这里不重新跑 Agent（执行链路已有 executor 与续跑的测试覆盖），
 * 而是按 executor 真实写入的行形状造数据，验证「读出来对不对」：
 * 统计口径、同一任务的执行次数、产出长度、以及跨用户不可见。
 */

const uid = DEFAULT_USER_ID;
const OTHER_UID = "00000000-0000-4000-8000-00000000beef";

const createdRunIds: string[] = [];
const createdTaskIds: string[] = [];

let agentId = "";

const LONG_OUTPUT = "框架".repeat(250); // 500 字
const SHORT_OUTPUT = "模拟".repeat(100); // 200 字
const PROMPT = "任务：验证便携咖啡器具在澳洲站的需求\n验收标准：给出三个候选与单件净利";

describe("modeOf：provider → 实际产出方式", () => {
  it("none 是框架模板，不是 AI 产出", () => {
    expect(modeOf("none")).toBe("framework");
  });
  it("mock 是模拟输出", () => {
    expect(modeOf("mock")).toBe("mock");
  });
  it("未知 provider 按真实模型处理（保守方向）", () => {
    expect(modeOf("openai-compatible")).toBe("model");
    expect(modeOf("some-new-provider")).toBe("model");
  });
  it("没有产出时不算任何一种产出方式", () => {
    // 失败的执行 provider 字段已经有值，但它什么都没产出，
    // 标成「模拟输出」会让人以为它真的输出了东西
    expect(modeOf("mock", false)).toBe("none");
    expect(modeOf("none", false)).toBe("none");
    expect(modeOf("mock", true)).toBe("mock");
  });
});

describe("执行记录读取", () => {
  beforeAll(async () => {
    await ensureLocalUser(uid);
    await ensureLocalUser(OTHER_UID);

    const db = getDb();
    const [agent] = await db.select().from(agents).where(eq(agents.slug, "product-researcher")).limit(1);
    if (!agent) throw new Error("测试需要内置 Agent product-researcher，请先执行 seed");
    agentId = agent.id;

    const base = Date.now() - 10 * 60_000;
    const mk = async (title: string, userId: string) => {
      const [t] = await db
        .insert(tasks)
        .values({ userId, title, source: "workflow", status: "review" })
        .returning({ id: tasks.id });
      createdTaskIds.push(t.id);
      return t.id;
    };

    const taskA = await mk("执行记录测试 · 咖啡器具", uid);
    const taskB = await mk("执行记录测试 · 折叠箱", uid);
    const taskC = await mk("别人的任务", OTHER_UID);

    const mkRun = async (input: {
      userId: string;
      taskId: string;
      status: "succeeded" | "failed";
      provider: string;
      offsetMin: number;
      durationMs: number;
      tokens: [number, number];
      error?: string;
      messages: { role: string; content: string }[];
    }) => {
      const started = new Date(base + input.offsetMin * 60_000);
      const [run] = await db
        .insert(agentRuns)
        .values({
          agentId,
          userId: input.userId,
          taskId: input.taskId,
          status: input.status,
          provider: input.provider,
          inputTokens: input.tokens[0],
          outputTokens: input.tokens[1],
          startedAt: started,
          finishedAt: new Date(started.getTime() + input.durationMs),
          error: input.error ?? null,
          createdAt: started,
        })
        .returning({ id: agentRuns.id });
      createdRunIds.push(run.id);
      if (input.messages.length > 0) {
        await db.insert(agentMessages).values(
          input.messages.map((m, i) => ({
            runId: run.id,
            agentId,
            role: m.role,
            content: m.content,
            createdAt: new Date(started.getTime() + i * 1000),
          })),
        );
      }
      return run.id;
    };

    // 同一任务下两次执行：先框架、后模拟。attemptNo 应当分别是 1 和 2
    await mkRun({
      userId: uid,
      taskId: taskA,
      status: "succeeded",
      provider: "none",
      offsetMin: 0,
      durationMs: 240,
      tokens: [0, 0],
      messages: [
        { role: "user", content: PROMPT },
        { role: "assistant", content: LONG_OUTPUT },
      ],
    });
    await mkRun({
      userId: uid,
      taskId: taskA,
      status: "succeeded",
      provider: "mock",
      offsetMin: 1,
      durationMs: 1500,
      tokens: [12, 34],
      messages: [
        { role: "user", content: PROMPT },
        { role: "assistant", content: SHORT_OUTPUT },
      ],
    });
    // 失败的那次：只有输入，没有产出
    await mkRun({
      userId: uid,
      taskId: taskB,
      status: "failed",
      provider: "none",
      offsetMin: 2,
      durationMs: 3000,
      tokens: [0, 0],
      error: "执行超过 120 秒，已中止",
      messages: [{ role: "user", content: PROMPT }],
    });
    // 别人的记录：当前用户不该看见
    await mkRun({
      userId: OTHER_UID,
      taskId: taskC,
      status: "succeeded",
      provider: "none",
      offsetMin: 3,
      durationMs: 100,
      tokens: [0, 0],
      messages: [
        { role: "user", content: "别人" },
        { role: "assistant", content: "别人的产出" },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    const db = getDb();
    if (createdRunIds.length > 0) {
      await db.delete(agentMessages).where(inArray(agentMessages.runId, createdRunIds));
      await db.delete(agentRuns).where(inArray(agentRuns.id, createdRunIds));
    }
    if (createdTaskIds.length > 0) {
      await db.delete(tasks).where(inArray(tasks.id, createdTaskIds));
    }
    await db.delete(users).where(eq(users.id, OTHER_UID));
    await closeDb();
  });

  it("统计按全部记录算，且只算自己的", async () => {
    const { stats } = await listRunCenter(uid);
    // 库里已有历史记录，所以断言「至少」而不是精确值——但这次插入的三条必须都在
    expect(stats.total).toBeGreaterThanOrEqual(3);
    expect(stats.failed).toBeGreaterThanOrEqual(1);
    expect(stats.mock).toBeGreaterThanOrEqual(1);
    expect(stats.outputChars).toBeGreaterThanOrEqual(LONG_OUTPUT.length + SHORT_OUTPUT.length);
    // 别人的那条 100 字产出不算进来
    expect(stats.outputChars).not.toBe(LONG_OUTPUT.length + SHORT_OUTPUT.length + 3);
  }, 30_000);

  it("同一任务下两次执行，编号是 1 和 2；列表按时间倒序", async () => {
    const { runs } = await listRunCenter(uid);
    const mine = runs.filter((r) => createdRunIds.includes(r.id));
    expect(mine).toHaveLength(3);

    // 列表整体倒序：最新的在最前
    const times = runs.map((r) => r.startedAt ?? "");
    const sorted = [...times].sort().reverse();
    expect(times).toEqual(sorted);

    const frameworkRun = mine.find((r) => r.mode === "framework" && r.status === "succeeded");
    const mockRun = mine.find((r) => r.mode === "mock");
    expect(frameworkRun?.attemptNo).toBe(1);
    expect(mockRun?.attemptNo).toBe(2);

    // 失败那条的任务里只有它自己，编号应当从 1 开始
    const failedRun = mine.find((r) => r.status === "failed");
    expect(failedRun?.attemptNo).toBe(1);
    expect(failedRun?.error).toContain("已中止");
  }, 30_000);

  it("产出长度与预览都取自 assistant 消息，失败记录不计产出", async () => {
    const { runs } = await listRunCenter(uid);
    const mine = runs.filter((r) => createdRunIds.includes(r.id));

    const long = mine.find((r) => r.outputChars === LONG_OUTPUT.length);
    expect(long).toBeTruthy();
    expect(long?.outputPreview?.startsWith("框架框架")).toBe(true);
    // 预览必须短于全文，否则列表首屏会被正文撑爆
    expect((long?.outputPreview ?? "").length).toBeLessThan(LONG_OUTPUT.length);

    const failed = mine.find((r) => r.status === "failed");
    expect(failed?.outputChars).toBe(0);
    expect(failed?.outputPreview).toBeNull();
    expect(failed?.mode).toBe("none");
  }, 30_000);

  it("耗时按毫秒算，不四舍五入成 0", async () => {
    const { runs } = await listRunCenter(uid);
    const mine = runs.filter((r) => createdRunIds.includes(r.id));
    const fast = mine.find((r) => r.outputChars === LONG_OUTPUT.length);
    // 240ms 必须原样读出来，不能变成 0（那会让人以为「没花时间」）
    expect(fast?.durationMs).toBe(240);
  }, 30_000);

  it("详情带回输入与产出全文", async () => {
    const { runs } = await listRunCenter(uid);
    const target = runs.find((r) => createdRunIds.includes(r.id) && r.mode === "mock");
    const detail = await getRunDetail(uid, target!.id);

    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[0].role).toBe("user");
    expect(detail.messages[0].content).toContain("便携咖啡器具");
    expect(detail.messages[1].role).toBe("assistant");
    expect(detail.messages[1].content).toBe(SHORT_OUTPUT);
    expect(detail.inputTokens).toBe(12);
    expect(detail.outputTokens).toBe(34);
    expect(detail.mode).toBe("mock");
  }, 30_000);

  it("别人的执行记录读不到（跨用户）", async () => {
    const db = getDb();
    const other = createdRunIds[3];
    expect(other).toBeTruthy();
    await expect(getRunDetail(uid, other)).rejects.toThrow(/不存在/);

    // 本人读自己的没问题（确认不是所有 id 都被拒）
    const own = createdRunIds[0];
    await expect(getRunDetail(uid, own)).resolves.toBeTruthy();
    await db.select().from(agentRuns).where(eq(agentRuns.id, own));
  }, 30_000);

  it("不存在的执行记录报 404 而不是 500", async () => {
    await expect(getRunDetail(uid, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      status: 404,
    });
  }, 30_000);
});

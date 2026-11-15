import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { currencyRates, financeScenarios } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { ensureLocalUser } from "@/server/services/workspace";
import {
  createRate,
  listCurrentRates,
  listRatePairs,
  lockScenarioFx,
  unlockScenarioFx,
} from "@/server/services/rates";

const uid = DEFAULT_USER_ID;
const rateIds: string[] = [];
const scenarioIds: string[] = [];
const SOURCE = "[测试] rates";
// SEK/NOK 不在批量抓取白名单里，测试数据与真实汇率完全隔离
const BASE = "SEK";
const QUOTE = "NOK";

describe("汇率登记、历史与方案锁定", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (rateIds.length > 0) await db.delete(currencyRates).where(inArray(currencyRates.id, rateIds));
    if (scenarioIds.length > 0) await db.delete(financeScenarios).where(inArray(financeScenarios.id, scenarioIds));
    await closeDb();
  });

  async function add(base: string, quote: string, rate: number, date: string) {
    const row = await createRate({
      baseCurrency: base,
      quoteCurrency: quote,
      rate,
      effectiveAt: date,
      source: SOURCE,
      dataType: "U",
    });
    rateIds.push(row.id);
    return row;
  }

  it("同一货币对录两条，当前值取较新那条，历史保留 2 条", async () => {
    await add(BASE, QUOTE, 0.14, "2026-11-01");
    await add(BASE, QUOTE, 0.1408, "2026-11-15");

    const current = await listCurrentRates();
    const cnyUsd = current.find((r) => r.base === BASE && r.quote === QUOTE);
    expect(cnyUsd?.rate).toBe(0.1408);
    expect(cnyUsd?.asOf).toContain("2026-11-15");

    const pairs = await listRatePairs();
    expect(pairs.find((p) => p.base === BASE && p.quote === QUOTE)?.historyCount).toBe(2);
  });

  it("币种代码大小写归一，不允许同币种对", async () => {
    // 用另一对，避免这条「当前时间」的记录盖过上面按日期排的历史
    const row = await createRate({
      baseCurrency: "dkk",
      quoteCurrency: "sek",
      rate: 7.1,
      source: SOURCE,
    });
    rateIds.push(row.id);
    expect(row.base).toBe("DKK");
    expect(row.quote).toBe("SEK");

    await expect(createRate({ baseCurrency: "USD", quoteCurrency: "USD", rate: 1 })).rejects.toMatchObject({
      code: "RATE_SAME_CURRENCY",
    });
  });

  it("锁定把汇率写到方案上，之后汇率变了方案也不变", async () => {
    const db = getDb();
    const [scenario] = await db
      .insert(financeScenarios)
      .values({ userId: uid, name: "[测试] 汇率锁定方案", currency: QUOTE, costCurrency: BASE })
      .returning();
    scenarioIds.push(scenario.id);

    const locked = await lockScenarioFx(uid, scenario.id);
    expect(locked.costCurrency).toBe(BASE);
    expect(locked.rate).toBe(0.1408);

    // 汇率表又来一条更新的
    await add(BASE, QUOTE, 0.15, "2026-11-20");
    const [after] = await db.select().from(financeScenarios).where(inArray(financeScenarios.id, [scenario.id]));
    expect(Number(after.fxRate)).toBeCloseTo(0.1408, 6);
    expect(after.fxSource).toBe(SOURCE);
  });

  it("解除锁定后回到未锁定状态", async () => {
    const id = scenarioIds[0];
    await unlockScenarioFx(uid, id);
    const db = getDb();
    const [row] = await db.select().from(financeScenarios).where(inArray(financeScenarios.id, [id]));
    expect(Number(row.fxRate)).toBe(0);
    expect(row.fxAsOf).toBeNull();
  });

  it("没有对应汇率时明确报缺，不按 1:1 默默锁定", async () => {
    const db = getDb();
    const [scenario] = await db
      .insert(financeScenarios)
      .values({ userId: uid, name: "[测试] 缺汇率方案", currency: "USD", costCurrency: "XXX" })
      .returning();
    scenarioIds.push(scenario.id);

    await expect(lockScenarioFx(uid, scenario.id)).rejects.toMatchObject({ code: "RATE_MISSING" });
  });

  it("成本币种与售价相同、或方案不存在，都给出明确错误", async () => {
    const db = getDb();
    const [scenario] = await db
      .insert(financeScenarios)
      .values({ userId: uid, name: "[测试] 同币种方案", currency: "USD", costCurrency: "" })
      .returning();
    scenarioIds.push(scenario.id);

    await expect(lockScenarioFx(uid, scenario.id)).rejects.toMatchObject({ code: "FX_NOT_NEEDED" });
    await expect(lockScenarioFx(uid, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "SCENARIO_NOT_FOUND",
    });
  });
});

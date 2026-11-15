import { computeFinance, parseFinanceRow } from "@/lib/finance/calc";
import { formatRate, pickQuote, resolveFx, type FxQuote } from "@/lib/finance/fx";
import { LockFxButton } from "./lock-fx";
import { PriceLadder } from "./price-ladder";

const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 财务模拟的计算结果。
 * 文档 7.6 要求输出：单件总成本 / 单件毛利 / 单件净利 / 利润率 / 盈亏平衡点。
 * 假设与币种必须与结果同行显示，否则结果不可复现。
 *
 * 汇率口径单独一行说清楚：用的是哪条汇率、什么时候的、锁没锁。
 * 只写「已按汇率折算」等于什么都没说——汇率天天变，不知道哪天的那条就没法对账。
 */
export function FinanceResults({
  rows,
  rates,
}: {
  rows: Record<string, unknown>[];
  rates: FxQuote[];
}) {
  return (
    <div className="finance-results">
      {rows.map((row) => {
        const parsed = parseFinanceRow(row);
        const fx = resolveFx({
          costCurrency: parsed.costCurrency,
          currency: parsed.currency,
          lockedRate: parsed.fxRate,
          lockedAsOf: row.fxAsOf as string | Date | null,
          lockedSource: (row.fxSource as string) ?? "",
          current: pickQuote(rates, parsed.costCurrency ?? "", parsed.currency),
        });
        const input = {
          ...parsed,
          fxRate: fx.rate,
          fxMissing: fx.missing,
        };
        const r = computeFinance(input);
        const positive = r.unitProfit > 0;

        // 折成人民币看：跨境卖家真正关心的是「这单赚多少人民币」
        const toCny = parsed.currency.toUpperCase() !== "CNY"
          ? pickQuote(rates, parsed.currency, "CNY")
          : null;
        const cnyProfit = toCny ? r.unitProfit * toCny.rate : null;

        return (
          <div className="finance-card" key={String(row.id)}>
            <div className="finance-head">
              <h3>{r.name || "未命名方案"}</h3>
              <span className="badge tone-muted">
                {fx.needed ? `${fx.base} → ${fx.quote}` : r.currency}
              </span>
            </div>

            {fx.missing && (
              <p className="finance-alert" role="alert">
                没有 {fx.base} → {fx.quote} 的汇率，成本没有折算，下面的数字不能拿去定价。
                去「汇率」里录一条，或点「锁定当前汇率」。
              </p>
            )}

            <div className="finance-grid">
              <div>
                <div className="stat-label">单件总成本</div>
                <div className={`finance-value ${fx.missing ? "is-unreliable" : ""}`}>{fmt(r.unitCost)}</div>
              </div>
              <div>
                <div className="stat-label">单件净利</div>
                <div className={`finance-value ${positive ? "" : "is-negative"} ${fx.missing ? "is-unreliable" : ""}`}>
                  {positive ? "+" : "−"}{fmt(Math.abs(r.unitProfit))}
                </div>
              </div>
              <div>
                <div className="stat-label">利润率</div>
                <div className={`finance-value ${fx.missing ? "is-unreliable" : ""}`}>{r.margin.toFixed(1)}%</div>
              </div>
              <div>
                <div className="stat-label">盈亏平衡单量</div>
                <div className={`finance-value ${fx.missing ? "is-unreliable" : ""}`}>
                  {r.breakEvenUnits > 0 ? `${r.breakEvenUnits.toLocaleString("zh-CN")} 单` : "—"}
                </div>
              </div>
            </div>

            {fx.needed && (
              <div className="finance-fx">
                <span className="fx-line">
                  成本按 1 {fx.base} = {formatRate(fx.rate)} {fx.quote}
                  {fx.asOf ? `（${new Date(fx.asOf).toLocaleDateString("zh-CN")}` : "（"}
                  {fx.source ? ` · ${fx.source}` : ""}）折算
                  {fx.locked ? " · 已锁定" : " · 未锁定，跟随当前汇率"}
                </span>
                <LockFxButton scenarioId={String(row.id)} locked={fx.locked} />
              </div>
            )}

            {cnyProfit !== null && !fx.missing && (
              <p className="finance-cny">
                折人民币：单件净利 ≈ ¥{fmt(cnyProfit)}（按 1 {parsed.currency} = {formatRate(toCny!.rate)} CNY
                {toCny!.asOf ? `，${new Date(toCny!.asOf).toLocaleDateString("zh-CN")}` : ""}
                {toCny!.source ? ` · ${toCny!.source}` : ""}）
              </p>
            )}

            <p className="finance-note">
              {r.breakEvenUnits > 0
                ? `固定投入 ${fmt(parsed.fixedCost)} ${fx.needed ? fx.base : r.currency}${fx.needed ? `（折算 ${fmt(parsed.fixedCost * fx.rate)} ${r.currency}）` : ""}，按当前单件净利需累计 ${r.breakEvenUnits.toLocaleString("zh-CN")} 单回本。`
                : "未填固定投入（或单件净利为负），无法给出盈亏平衡点——这一点不猜。"}
            </p>
            <p className="finance-assume">
              口径：售价 −（采购 + 运费 + 单件广告 + 单件其他 + 售价 ×(佣金率 + 支付费率)）。
              {fx.needed ? `成本与固定投入按 1 ${fx.base} = ${formatRate(fx.rate)} ${fx.quote} 折算后再计入。` : ""}
              假设来自本方案的输入字段，改任一数值即重算。
            </p>

            <PriceLadder input={input} />
          </div>
        );
      })}
    </div>
  );
}

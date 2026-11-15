import { computeFinance, parseFinanceRow } from "@/lib/finance/calc";
import { PriceLadder } from "./price-ladder";

const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 财务模拟的计算结果。
 * 文档 7.6 要求输出：单件总成本 / 单件毛利 / 单件净利 / 利润率 / 盈亏平衡点。
 * 假设与币种必须与结果同行显示，否则结果不可复现。
 */
export function FinanceResults({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="finance-results">
      {rows.map((row) => {
        const input = parseFinanceRow(row);
        const r = computeFinance(input);
        const positive = r.unitProfit > 0;
        return (
          <div className="finance-card" key={String(row.id)}>
            <div className="finance-head">
              <h3>{r.name || "未命名方案"}</h3>
              <span className="badge tone-muted">{r.currency}</span>
            </div>

            <div className="finance-grid">
              <div>
                <div className="stat-label">单件总成本</div>
                <div className="finance-value">{fmt(r.unitCost)}</div>
              </div>
              <div>
                <div className="stat-label">单件净利</div>
                <div className={`finance-value ${positive ? "" : "is-negative"}`}>
                  {positive ? "+" : "−"}{fmt(Math.abs(r.unitProfit))}
                </div>
              </div>
              <div>
                <div className="stat-label">利润率</div>
                <div className="finance-value">{r.margin.toFixed(1)}%</div>
              </div>
              <div>
                <div className="stat-label">盈亏平衡单量</div>
                <div className="finance-value">
                  {r.breakEvenUnits > 0 ? `${r.breakEvenUnits.toLocaleString("zh-CN")} 单` : "—"}
                </div>
              </div>
            </div>

            <p className="finance-note">
              {r.breakEvenUnits > 0
                ? `固定投入 ${fmt(input.fixedCost)} ${r.currency}，按当前单件净利需累计 ${r.breakEvenUnits.toLocaleString("zh-CN")} 单回本。`
                : "未填固定投入（或单件净利为负），无法给出盈亏平衡点——这一点不猜。"}
            </p>
            <p className="finance-assume">
              口径：售价 −（采购 + 运费 + 单件广告 + 单件其他 + 售价 ×(佣金率 + 支付费率)）。
              假设来自本方案的输入字段，改任一数值即重算。
            </p>

            <PriceLadder input={input} />
          </div>
        );
      })}
    </div>
  );
}

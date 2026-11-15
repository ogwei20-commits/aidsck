"use client";

import { useMemo, useState } from "react";
import {
  buildPriceLadder,
  defaultLadderPrices,
  minViablePrice,
  marginalProfitPerUnit,
  round4,
  rateSum,
  type FinanceInput,
} from "@/lib/finance/calc";
import { BreakEvenChart } from "./break-even-chart";

const money = (n: number) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 多售价情景对比（文档 7.6）。
 *
 * 为什么只给一个「基准价」输入、其余档位自动跟随：
 * 定价讨论的真实问题是「我这个价，上下浮动一档会怎样」，
 * 而不是「我要精确输入五个价格」。一个输入框在手机上也好用，
 * 五个输入框在 375px 下会挤成一片。
 *
 * 只改售价、其余输入不动——否则每行差异里混了别的变量，就看不出来是定价在起作用。
 */
export function PriceLadder({ input }: { input: FinanceInput }) {
  const [base, setBase] = useState<number>(input.sellPrice);
  const [raw, setRaw] = useState<string>(String(input.sellPrice));

  const effective = Number.isFinite(base) && base > 0 ? base : input.sellPrice;
  const withBase = useMemo(() => ({ ...input, sellPrice: effective }), [input, effective]);
  const prices = useMemo(() => defaultLadderPrices(effective), [effective]);
  const ladder = useMemo(() => buildPriceLadder(withBase, prices), [withBase, prices]);

  const cheapestViable = ladder.rows.find((r) => r.isViable) ?? null;
  const bestRow = ladder.rows.find((r) => ladder.bestPrice !== null && Math.abs(r.price - ladder.bestPrice) < 0.005);
  // 五档全亏时，「最优」会被读成「这档能赚」——那是在骗人，改成「亏最少」
  const allLoss = bestRow !== undefined && bestRow.monthlyProfit < 0;
  const bestLabel = allLoss ? "亏最少" : "最优";
  // 单件赚、月利润却是负的：不是价格问题，是量没跑够
  const underVolume = ladder.rows.some((r) => r.isViable && r.monthlyProfit < 0);
  const step = effective < 20 ? 0.5 : 1;

  function commit(next: string) {
    setRaw(next);
    const n = Number(next);
    if (Number.isFinite(n) && n > 0) setBase(n);
  }

  return (
    <div className="ladder">
      <div className="ladder-head">
        <div>
          <strong>多售价对比</strong>
          <span>
            其余输入不变，只动售价。档位按基准价上下 5% / 10% 生成，取整到 {step}。
          </span>
        </div>
        <label className="ladder-input">
          <span>基准售价</span>
          <input
            type="number"
            min={step}
            step={step}
            inputMode="decimal"
            value={raw}
            onChange={(e) => commit(e.target.value)}
            onBlur={() => {
              // 输入框里留着非法值会让人以为按这个价算过了
              if (!(Number(raw) > 0)) {
                setRaw(String(input.sellPrice));
                setBase(input.sellPrice);
              }
            }}
            aria-label="基准售价"
          />
        </label>
      </div>

      <p className="ladder-scroll-hint">六列在窄屏放不下，表格可左右滑动</p>
      <div className="table-wrap">
        <table className="ladder-table">
          <thead>
            <tr>
              <th>售价</th>
              <th>单件成本</th>
              <th>单件净利</th>
              <th>利润率</th>
              <th>回本单量</th>
              <th>月利润</th>
            </tr>
          </thead>
          <tbody>
            {ladder.rows.map((r) => {
              const best = bestRow !== undefined && Math.abs(r.price - bestRow.price) < 0.005;
              return (
                <tr
                  key={r.price}
                  className={[
                    r.isBaseline ? "is-baseline" : "",
                    r.isViable ? "" : "is-loss",
                    best ? "is-best" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td className="mono">
                    {money(r.price)}
                    {r.isBaseline && <em className="ladder-tag">当前</em>}
                    {best && <em className={`ladder-tag ${allLoss ? "is-warn" : "is-best"}`}>{bestLabel}</em>}
                  </td>
                  <td className="mono">{money(r.unitCost)}</td>
                  <td className={`mono ${r.isViable ? "" : "is-negative"}`}>
                    {r.unitProfit >= 0 ? "+" : "−"}
                    {money(Math.abs(r.unitProfit))}
                  </td>
                  <td className="mono">{r.margin.toFixed(1)}%</td>
                  <td className="mono">
                    {r.breakEvenUnits > 0 ? `${r.breakEvenUnits.toLocaleString("zh-CN")} 单` : "—"}
                  </td>
                  <td className={`mono ${r.monthlyProfit >= 0 ? "" : "is-negative"}`}>
                    {r.monthlyProfit >= 0 ? "+" : "−"}
                    {money(Math.abs(r.monthlyProfit))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="ladder-note">
        每涨 1 元售价，净利只增 <strong>{money(marginalProfitPerUnit(withBase))}</strong> 元
        ——佣金与支付费按售价合计抽 <strong>{round4(rateSum(withBase) * 100)}%</strong>，涨价的一部分被平台拿走。
        {(() => {
          const p = minViablePrice(withBase);
          if (p === null) return "费率合计已达 100%，涨多少都不赚钱。";
          if (p <= 0) return "单件成本里与售价无关的部分为 0，任意正价都不亏。";
          return `低于 ${money(p)} 元必亏，卖得越多亏得越多。`;
        })()}
      </p>

      {cheapestViable && !cheapestViable.isBaseline && (
        <p className="ladder-note is-muted">
          当前基准价 {money(effective)} 元；单件净利转正的最低档位是 {money(cheapestViable.price)} 元
          （{money(cheapestViable.unitProfit)} 元/件），但仅代表卖一件不亏，不代表整体回本。
        </p>
      )}

      {underVolume && (
        <p className="ladder-note is-muted">
          这几档单件是赚的，月利润仍为负：按每月 {input.expectedOrders.toLocaleString("zh-CN")} 单，
          还没覆盖 {money(input.fixedCost)} 固定投入。这是量不够，不是定价错了——先别急着涨价。
        </p>
      )}

      {/* 表给具体数字，图给趋势与保本位置。两者共用同一个基准价，改价时同步 */}
      <BreakEvenChart input={withBase} />
    </div>
  );
}

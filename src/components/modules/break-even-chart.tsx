import {
  fixedUnitCost,
  minViablePrice,
  rateSum,
  type FinanceInput,
} from "@/lib/finance/calc";

/**
 * 保本线图示（文档 7.6）。
 *
 * 为什么用纯 SVG 而不是引图表库：这里只有一条直线，坐标轴固定，
 * 引一个 200KB 的库来画一条 y = kx - c，代价全在包体积上，收益为零。
 *
 * 为什么画单件净利而不是月利润：月利润 = 单件净利 × 单量 − 固定投入，
 * 同一张图里混两个量纲会让人读错。单件净利这条线上，与 x 轴的交点
 * 就是保本售价，物理含义最直接。
 */

const W = 680;
const H = 280;
const PAD = { left: 62, right: 28, top: 22, bottom: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** 把区间切成好看的刻度步长（1 / 2 / 5 × 10^n） */
function niceStep(range: number, count: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function money(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function axisMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${(n / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(abs < 10 ? 1 : 0);
}

export function BreakEvenChart({ input }: { input: FinanceInput }) {
  const r = rateSum(input);
  const k = 1 - r;
  const c = fixedUnitCost(input);
  const price = input.sellPrice;
  const breakEven = minViablePrice(input);
  const currency = input.currency || "USD";

  const profitAt = (p: number) => p * k - c;
  const currentProfit = profitAt(price);

  // x 轴区间：保本点与当前价都要在图里，且两侧各留一段，才能看出趋势
  const anchors = [price, breakEven ?? price].filter((v) => Number.isFinite(v) && v > 0);
  const lowAnchor = Math.min(...anchors);
  const highAnchor = Math.max(...anchors);
  const rawMin = Math.max(0, lowAnchor * 0.62);
  const rawMax = Math.max(highAnchor * 1.34, lowAnchor * 1.34);

  const xStep = niceStep(rawMax - rawMin, 5);
  const xMin = Math.floor(rawMin / xStep) * xStep;
  const xMax = Math.ceil(rawMax / xStep) * xStep;

  const ys = [profitAt(xMin), profitAt(xMax), 0];
  const yLow = Math.min(...ys);
  const yHigh = Math.max(...ys);
  const yPad = Math.max((yHigh - yLow) * 0.12, 0.5);
  const yStep = niceStep(yHigh - yLow + yPad * 2, 4);
  const yMin = Math.floor((yLow - yPad) / yStep) * yStep;
  const yMax = Math.ceil((yHigh + yPad) / yStep) * yStep;

  const xTo = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const yTo = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin || 1)) * PLOT_H;

  const xTicks: number[] = [];
  for (let v = xMin; v <= xMax + 1e-9; v += xStep) xTicks.push(Math.round(v * 100) / 100);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(Math.round(v * 100) / 100);

  const lineY1 = yTo(profitAt(xMin));
  const lineY2 = yTo(profitAt(xMax));
  const zeroY = yTo(0);
  const breakEvenX = breakEven !== null && breakEven >= xMin && breakEven <= xMax ? xTo(breakEven) : null;
  const priceX = xTo(price);

  // 两个标注挨太近时不画保本点文字，否则字叠字，改成下方一句结论
  const crowded = breakEvenX !== null && Math.abs(breakEvenX - priceX) < 54;

  const verdict =
    k <= 0
      ? "佣金与支付费率合计已达 100%，涨价也无法覆盖成本——先把费率谈下来。"
      : breakEven === null
        ? "固定成本为 0，任意售价都不亏本金，但利润全靠定价。"
        : currentProfit >= 0
          ? `当前价 ${money(price)} ${currency} 高出保本价 ${money(breakEven)} ${currency}，每件净利 ${money(currentProfit)} ${currency}。`
          : `当前价 ${money(price)} ${currency} 低于保本价 ${money(breakEven)} ${currency}，每卖一件亏 ${money(Math.abs(currentProfit))} ${currency}。`;

  return (
    <div className="be-chart">
      <div className="be-chart-head">
        <div>
          <strong>保本线</strong>
          <span>横轴是售价，纵轴是单件净利。线与 0 轴的交点就是保本售价，低于它卖得越多亏得越多。</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="be-svg"
        role="img"
        aria-label={`售价与单件净利的关系：${verdict}`}
      >
        {/* 网格与纵轴刻度 */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yTo(tick)}
              y2={yTo(tick)}
              className={tick === 0 ? "be-zero" : "be-grid"}
            />
            <text x={PAD.left - 10} y={yTo(tick) + 4} textAnchor="end" className="be-axis-text">
              {axisMoney(tick)}
            </text>
          </g>
        ))}

        {/* 横轴刻度 */}
        {xTicks.map((tick) => (
          <text key={`x-${tick}`} x={xTo(tick)} y={H - PAD.bottom + 18} textAnchor="middle" className="be-axis-text">
            {axisMoney(tick)}
          </text>
        ))}

        {/* 盈利/亏损背景：0 线以上淡绿，以下淡红，让「哪边是赚」一眼可见 */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={Math.max(0, zeroY - PAD.top)}
          className="be-zone is-profit"
        />
        <rect
          x={PAD.left}
          y={zeroY}
          width={PLOT_W}
          height={Math.max(0, H - PAD.bottom - zeroY)}
          className="be-zone is-loss"
        />

        {/* 绘图区边框：没有边框时图会「浮」在深色页面里，看不出边界在哪 */}
        <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} className="be-frame" fill="none" />

        {/* 保本价竖虚线 */}
        {breakEvenX !== null && (
          <line
            x1={breakEvenX}
            x2={breakEvenX}
            y1={PAD.top}
            y2={H - PAD.bottom}
            className="be-break-line"
          />
        )}

        {/* 主折线 */}
        <line x1={PAD.left} x2={W - PAD.right} y1={lineY1} y2={lineY2} className="be-line" />

        {/* 当前售价 */}
        <line x1={priceX} x2={priceX} y1={PAD.top} y2={H - PAD.bottom} className="be-price-line" />
        <circle cx={priceX} cy={yTo(currentProfit)} r={4.5} className={currentProfit >= 0 ? "be-dot is-ok" : "be-dot is-bad"} />

        {/* 保本点 */}
        {breakEvenX !== null && (
          <circle cx={breakEvenX} cy={zeroY} r={3.5} className="be-dot is-break" />
        )}

        {/* 标注：当前价永远标；保本价在空间足够时才标，避免叠字 */}
        <text
          x={priceX}
          y={Math.max(PAD.top + 12, yTo(currentProfit) - 12)}
          textAnchor={priceX > W - 120 ? "end" : "middle"}
          className="be-tag is-price"
        >
          当前 {money(price)}
        </text>
        {breakEven !== null && breakEvenX !== null && !crowded && (
          <text x={breakEvenX} y={H - PAD.bottom + 34} textAnchor="middle" className="be-tag is-break">
            保本 {money(breakEven)}
          </text>
        )}

        {/* 轴名 */}
        <text x={W - PAD.right} y={H - PAD.bottom + 34} textAnchor="end" className="be-axis-label">
          售价 / {currency}
        </text>
      </svg>

      <p className={`be-verdict${currentProfit >= 0 ? "" : " is-bad"}`}>
        {verdict}
        {crowded && breakEven !== null && ` 保本价 ${money(breakEven)} ${currency}。`}
      </p>
    </div>
  );
}

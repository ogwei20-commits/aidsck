import {
  buildPriceLadder,
  computeFinance,
  defaultLadderPrices,
  marginalProfitPerUnit,
  minViablePrice,
  round4,
  type FinanceInput,
} from "@/lib/finance/calc";
import { resolveFx } from "@/lib/finance/fx";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { calculateFinanceSchema } from "@/lib/validation/schemas";
import { latestRate } from "@/server/services/rates";

export const dynamic = "force-dynamic";

/**
 * 财务计算接口（文档 6）。
 *
 * 为什么要有这个接口，而不只是页面里算：
 * 1. Agent 与工作流的财务节点需要一份可复用的计算口径，不能各自抄一遍公式；
 * 2. 页面上的数字可以被人眼复核，而对外调用（脚本、未来的自动化）只能靠接口；
 * 3. 口径只有一份（lib/finance/calc.ts），接口只做输入校验与结果组装。
 *
 * 汇率：调用方可以自己给 fxRate；不给就按库里当前有效汇率解析。
 * 解析不到时返回 fx.missing = true，数字照算但明确标注「成本未折算」——
 * 静默按 1:1 算出一个看起来很正常的利润，比报错危险得多。
 *
 * 不写库：这是纯计算。要留存结果，走财务方案模块的创建接口。
 */
export async function POST(request: Request) {
  try {
    const input = parseInput(calculateFinanceSchema, await readJson(request));

    const base = input.costCurrency.trim().toUpperCase();
    const quote = input.currency.trim().toUpperCase();
    const needed = Boolean(base) && Boolean(quote) && base !== quote;

    let fx;
    if (!needed) {
      fx = resolveFx({ costCurrency: base, currency: quote });
    } else if (input.fxRate && input.fxRate > 0) {
      fx = resolveFx({
        costCurrency: base,
        currency: quote,
        lockedRate: input.fxRate,
        lockedSource: "request",
      });
    } else {
      const current = await latestRate(base, quote);
      fx = resolveFx({ costCurrency: base, currency: quote, current });
    }

    const finance: FinanceInput = {
      name: input.name,
      sellPrice: input.sellPrice,
      purchaseCost: input.purchaseCost,
      shippingCost: input.shippingCost,
      commissionRate: input.commissionRate,
      paymentRate: input.paymentRate,
      adCost: input.adCost,
      otherCost: input.otherCost,
      fixedCost: input.fixedCost,
      expectedOrders: input.expectedOrders,
      currency: input.currency,
      costCurrency: base,
      fxRate: fx.rate,
      fxMissing: fx.missing,
    };

    const snapshot = computeFinance(finance);
    const prices = input.prices ?? defaultLadderPrices(finance.sellPrice);
    const ladder = buildPriceLadder(finance, prices);

    return ok({
      mode: "deterministic",
      note: "纯公式计算，不含任何模型推断；金额保留 4 位小数，与数据库 numeric 口径一致。",
      currency: input.currency,
      costCurrency: base || input.currency,
      fx,
      snapshot,
      ladder,
      /** 单独再给一份，便于调用方不必理解 ladder 结构 */
      breakEvenPrice: minViablePrice(finance),
      marginalProfitPerUnit: marginalProfitPerUnit(finance),
      /** 费率合计，百分比。超过 100% 时保本价不存在，调用方需要据此判断 */
      totalRatePercent: round4(input.commissionRate + input.paymentRate),
    });
  } catch (error) {
    return fail(error);
  }
}

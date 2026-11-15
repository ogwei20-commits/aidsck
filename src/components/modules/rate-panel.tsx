"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CURRENCY_CODES } from "@/lib/finance/currencies";
import { formatRate } from "@/lib/finance/fx";
import type { RatePair } from "@/server/services/rates";

/**
 * 汇率面板（财务页）。
 *
 * 为什么放在财务页而不是新开一个「汇率」模块：
 * 汇率在这里只有一个用途——把成本折算成售价币种。
 * 单独占一个导航项，用户得先想「我要去哪一页」，而答案永远是「算账的时候」。
 *
 * 只追加不覆盖：同一天改主意了，就再录一条，旧的那条留在历史里。
 */

const CURRENCIES: readonly string[] = CURRENCY_CODES;

const SOURCE_LABEL: Record<string, string> = {
  manual: "手动录入",
  "exchangerate-api": "exchangerate-api",
  frankfurter: "frankfurter（ECB）",
};

export function RatePanel({ pairs }: { pairs: RatePair[] }) {
  const router = useRouter();
  const [base, setBase] = useState("CNY");
  const [quote, setQuote] = useState("USD");
  const [rate, setRate] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) {
      setError("汇率必须是大于 0 的数字");
      return;
    }
    if (base === quote) {
      setError("基准币种与报价币种不能相同");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/v1/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseCurrency: base,
          quoteCurrency: quote,
          rate: value,
          effectiveAt,
          source: "manual",
          dataType: "U",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? `保存失败（HTTP ${response.status}）`);
        return;
      }
      setNotice(`已登记 1 ${base} = ${formatRate(value)} ${quote}`);
      setRate("");
      router.refresh();
    } catch {
      setError("连不上服务，请确认本地服务还在运行");
    } finally {
      setBusy(false);
    }
  }

  async function fetchLatest() {
    setError("");
    setNotice("");
    setFetching(true);
    try {
      const response = await fetch("/api/v1/rates/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? `拉取失败（HTTP ${response.status}）`);
        return;
      }
      const d = payload.data as { inserted: unknown[]; skipped: unknown[]; source: string };
      setNotice(
        `从 ${d.source} 拉取完成：新增 ${d.inserted.length} 条，跳过 ${d.skipped.length} 条（同源同日同值不重复写）。`,
      );
      router.refresh();
    } catch {
      setError("连不上服务，或本机没有外网。断网时直接手动录一条即可。");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="rates">
      <form className="rate-form" onSubmit={submit}>
        <div className="rate-field">
          <span>基准币种（成本）</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} aria-label="基准币种">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="rate-field">
          <span>报价币种（售价）</span>
          <select value={quote} onChange={(e) => setQuote(e.target.value)} aria-label="报价币种">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="rate-field">
          <span>1 {base} = ? {quote}</span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder={base === "CNY" && quote === "USD" ? "0.1408" : "输入汇率"}
            aria-label="汇率"
          />
        </div>

        <div className="rate-field">
          <span>生效日期</span>
          <input
            type="date"
            value={effectiveAt}
            onChange={(e) => setEffectiveAt(e.target.value)}
            aria-label="生效日期"
          />
        </div>

        <div className="rate-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "保存中…" : "登记汇率"}
          </button>
          <button type="button" className="btn-ghost" onClick={fetchLatest} disabled={fetching}>
            {fetching ? "拉取中…" : `拉取 ${base} 最新汇率`}
          </button>
          <span className="rate-hint">生效日期留空 = 现在；同一天录两次会留两条历史，不覆盖。</span>
        </div>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-ok" role="status">{notice}</p>}

      {pairs.length === 0 ? (
        <p className="rate-empty">
          还没有任何汇率。手动录一条，或点上面的「拉取最新」——拉不到时也能手录，不影响算账。
        </p>
      ) : (
        <div className="rate-table-wrap">
          <table className="rate-table">
            <thead>
              <tr>
                <th>货币对</th>
                <th>当前汇率</th>
                <th>生效时间</th>
                <th>来源</th>
                <th>历史</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr key={`${pair.base}/${pair.quote}`}>
                  <td className="rate-pair">
                    {pair.base} → {pair.quote}
                  </td>
                  <td className="rate-value">
                    1 = {formatRate(pair.current?.rate ?? 0)}
                  </td>
                  <td className="rate-when">
                    {pair.current?.asOf
                      ? new Date(pair.current.asOf).toLocaleDateString("zh-CN")
                      : "—"}
                  </td>
                  <td>
                    <span className="rate-source">
                      {SOURCE_LABEL[pair.current?.source ?? ""] ?? pair.current?.source ?? "—"}
                    </span>
                  </td>
                  <td className="rate-count">{pair.historyCount} 条</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

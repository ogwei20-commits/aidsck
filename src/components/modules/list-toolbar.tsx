import Link from "next/link";

/**
 * 列表页的搜索与分页。
 *
 * 用原生 form GET 而不是受控组件：搜索是「换一个 URL」而不是「改一个状态」，
 * 提交后地址栏里带着 q，刷新、分享、前进后退都能复现，也不需要额外 JS。
 */

function pageHref(basePath: string, q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** 页码窗口：首尾恒显，当前页左右各留 1 个，中间用 … 省略 */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function ListToolbar({
  basePath,
  q,
  total,
  page,
  totalPages,
  pageSize,
  itemLabel,
}: {
  basePath: string;
  q: string;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  itemLabel: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="list-toolbar">
      <form className="list-search" action={basePath} method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder={`搜索${itemLabel}…`}
          aria-label={`搜索${itemLabel}`}
        />
        <button className="btn-mini" type="submit">
          搜索
        </button>
      </form>

      <p className="list-meta">
        {q ? (
          <>
            匹配「<strong>{q}</strong>」共 <strong>{total}</strong> 条
            <Link className="search-clear" href={basePath}>
              清除
            </Link>
          </>
        ) : (
          <>共 <strong>{total}</strong> 条</>
        )}
        {total > 0 && totalPages > 1 && <> · 当前 {first}–{last}</>}
      </p>

      {totalPages > 1 && (
        <nav className="pager" aria-label="分页">
          {page > 1 ? (
            <Link className="pager-step" href={pageHref(basePath, q, page - 1)} rel="prev">
              上一页
            </Link>
          ) : (
            <span className="pager-step is-disabled">上一页</span>
          )}

          {pageWindow(page, totalPages).map((item, index) =>
            item === "…" ? (
              <span className="pager-gap" key={`gap-${index}`}>
                …
              </span>
            ) : (
              <Link
                key={item}
                href={pageHref(basePath, q, item)}
                className={`pager-num${item === page ? " is-current" : ""}`}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </Link>
            ),
          )}

          {page < totalPages ? (
            <Link className="pager-step" href={pageHref(basePath, q, page + 1)} rel="next">
              下一页
            </Link>
          ) : (
            <span className="pager-step is-disabled">下一页</span>
          )}
        </nav>
      )}
    </div>
  );
}

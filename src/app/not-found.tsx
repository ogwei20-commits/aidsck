import Link from "next/link";
import { NAV_ITEMS, navHref } from "@/lib/config/navigation";

/**
 * 404 页。
 *
 * 不只说「找不到」，还把导航摆出来——输入错的地址多半是想去某个模块，
 * 直接给一条能点的路，比让人退回去再找一次强。
 */
export default function NotFound() {
  const links = NAV_ITEMS.filter((item) => item.status === "ready")
    .slice(0, 8)
    .map((item) => ({ href: navHref(item.slug), label: item.label }));

  return (
    <div className="fallback">
      <div className="fallback-card">
        <div className="eyebrow">404 / 页面不存在</div>
        <h1>这个地址没有对应的页面</h1>
        <p className="fallback-lead">
          可能是链接写错了，也可能这个模块还在规划中。下面是最常用的几个入口。
        </p>

        <div className="fallback-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn-mini">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="fallback-actions">
          <Link className="btn-primary" href="/">
            回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

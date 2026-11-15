"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ITEMS, navHref } from "@/lib/config/navigation";
import { Icon, type IconName } from "@/components/ui/icons";

const ICONS: Record<string, IconName> = {
  dashboard: "grid", assistant: "spark", projects: "folder", tasks: "check",
  agents: "bot", workflows: "flow", market: "globe", platforms: "layers",
  products: "box", suppliers: "truck", finance: "calculator", learning: "book",
  growth: "trend", knowledge: "database", files: "file", reports: "report",
  lineage: "link", approvals: "shield", settings: "settings",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Icon name="layers" size={20} /></span>
        <div>
          <div className="brand-name">跨境电商 AI 工作台</div>
          <div className="brand-sub">CROSSBORDER / PHASE 1</div>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group}>
          <div className="nav-group-label">{group}</div>
          <nav className="nav-list" aria-label={group}>
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const href = navHref(item.slug);
              const active = pathname === href;
              return (
                <Link
                  key={item.slug}
                  href={href}
                  className={`nav-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={`${item.label} · ${item.description}`}
                >
                  <Icon name={ICONS[item.slug] ?? "grid"} size={16} />
                  <span className="nav-label">{item.label}</span>
                  {item.status === "planned" && <span className="nav-tag">规划中</span>}
                  {item.status === "partial" && <span className="nav-tag is-partial">最小版</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-foot">
        本地运行 · 单人使用<br />
        数据保存在本机 PostgreSQL<br />
        Phase 1 / Sprint 1 骨架
      </div>
    </aside>
  );
}

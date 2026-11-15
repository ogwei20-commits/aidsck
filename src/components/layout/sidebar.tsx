"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";
import { navByGroup } from "@/lib/config/navigation";

const ICONS: Record<string, IconName> = {
  dashboard: "grid",
  assistant: "spark",
  projects: "folder",
  tasks: "check",
  agents: "bot",
  workflows: "flow",
  runs: "list",
  market: "globe",
  platforms: "layers",
  products: "box",
  suppliers: "truck",
  finance: "calculator",
  learning: "book",
  growth: "trend",
  knowledge: "database",
  files: "file",
  reports: "report",
  lineage: "link",
  approvals: "shield",
  settings: "settings",
};

export function Sidebar() {
  const pathname = usePathname();
  const groups = navByGroup();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Icon name="globe" size={20} /></span>
        <span className="brand-text">
          <span className="brand-name">CrossBorder AI</span>
          <span className="brand-sub">WORKSPACE</span>
        </span>
      </div>

      {groups.map((g) => (
        <nav className="nav-group" key={g.group} aria-label={g.group}>
          <div className="nav-group-label">{g.group}</div>
          <div className="nav-list">
            {g.items.map((item) => {
              const href = item.slug === "dashboard" ? "/" : `/${item.slug}`;
              const active = item.slug === "dashboard" ? pathname === "/" : pathname === href;
              return (
                <Link
                  key={item.slug}
                  href={href}
                  className={`nav-item${active ? " is-active" : ""}`}
                  title={item.description}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="nav-icon"><Icon name={ICONS[item.slug] ?? "grid"} size={16} /></span>
                  <span className="nav-label">{item.label}</span>
                  {item.status === "partial" && <span className="nav-tag is-partial">部分</span>}
                </Link>
              );
            })}
          </div>
        </nav>
      ))}

      <div className="sidebar-foot">
        本地运行 · 数据存本机 PostgreSQL
        <br />
        未接入认证，禁止暴露公网
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

const NARROW = "(max-width: 1000px)";

export function Sidebar() {
  const pathname = usePathname();
  const groups = navByGroup();
  const [open, setOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const items = groups.flatMap((g) => g.items);
  const current = items.find((item) =>
    (item.slug === "dashboard" ? "/" : `/${item.slug}`) === pathname,
  );

  // 窄屏判定：只在需要时把抽屉从可访问树里摘掉
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // 打开时锁滚动、接 ESC、把焦点圈在抽屉里
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="nav-root">
      <div className="mobile-bar">
        <button
          ref={triggerRef}
          type="button"
          className="mb-trigger"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "close" : "menu"} size={20} />
        </button>
        <span className="brand-mark"><Icon name="globe" size={20} /></span>
        <span className="mb-title">CrossBorder AI</span>
        {current && <span className="mb-current">{current.label}</span>}
      </div>

      <aside
        id="site-nav"
        ref={panelRef}
        className="sidebar"
        data-open={open ? "true" : "false"}
        aria-label="主导航"
        tabIndex={-1}
        inert={isNarrow && !open}
      >
        <div className="brand">
          <span className="brand-mark"><Icon name="globe" size={20} /></span>
          <span className="brand-text">
            <span className="brand-name">CrossBorder AI</span>
            <span className="brand-sub">WORKSPACE</span>
          </span>
          <button type="button" className="sb-close" aria-label="关闭导航菜单" onClick={close}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {groups.map((group) => (
          <nav className="nav-group" key={group.group} aria-label={group.group}>
            <div className="nav-group-label">{group.group}</div>
            <div className="nav-list">
              {group.items.map((item) => {
                const href = item.slug === "dashboard" ? "/" : `/${item.slug}`;
                const active = item.slug === "dashboard" ? pathname === "/" : pathname === href;
                return (
                  <Link
                    key={item.slug}
                    href={href}
                    className={`nav-item${active ? " is-active" : ""}`}
                    title={item.description}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
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

      <div
        className="drawer-backdrop"
        data-open={open ? "true" : "false"}
        role="presentation"
        onClick={close}
      />
    </div>
  );
}

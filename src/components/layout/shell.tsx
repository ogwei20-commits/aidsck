import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { Sidebar } from "./sidebar";

export function AppShell({
  children,
  aiLabel,
  dbConfigured,
}: {
  children: ReactNode;
  aiLabel: string;
  dbConfigured: boolean;
}) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-title">工作台 / Phase 1 基础架构</div>
          <div className="topbar-chips">
            <span className="chip"><Icon name="database" size={16} />{dbConfigured ? "数据库已配置" : "数据库未配置"}</span>
            <span className="chip"><span className={`dot${dbConfigured ? "" : " is-off"}`} />本地运行</span>
            <span className="chip"><Icon name="spark" size={16} />{aiLabel}</span>
          </div>
        </header>
        <main className="content">{children}</main>
        <footer className="footer">
          <span>CrossBorder AI Workspace · Development Blueprint V1.0 · Sprint 1</span>
          <span>所有业务数据持久化于本机，静态页面不冒充功能</span>
        </footer>
      </div>
    </div>
  );
}

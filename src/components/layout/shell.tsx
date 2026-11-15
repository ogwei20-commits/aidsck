import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { getTheme } from "@/lib/config/theme";
import type { ThemeName } from "@/lib/config/theme-shared";
import { Sidebar } from "./sidebar";
import { ThemeSwitch } from "./theme-switch";

export async function AppShell({
  children,
  aiLabel,
  dbConfigured,
}: {
  children: ReactNode;
  aiLabel: string;
  dbConfigured: boolean;
}) {
  const theme: ThemeName = await getTheme();

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-title">本地工作台 · 所有数据写入本机 PostgreSQL</div>
          <div className="topbar-right">
            <span className="chip">
              <Icon name="database" size={16} />
              {dbConfigured ? "数据库已连接" : "数据库未配置"}
            </span>
            <span className="chip">
              <span className={`dot${dbConfigured ? "" : " is-off"}`} />
              {aiLabel}
            </span>
            <ThemeSwitch initial={theme} />
          </div>
        </header>
        <main className="content">{children}</main>
        <footer className="footer">
          <span>CrossBorder AI Workspace · 第一阶段</span>
          <span>19 个模块均可增删改查 · 数据存在本机，不上传云端</span>
        </footer>
      </div>
    </div>
  );
}

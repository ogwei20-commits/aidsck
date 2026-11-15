import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/shell";
import { getProviderStatus } from "@/server/ai/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "跨境电商 AI 智能体工作台 | Phase 1",
  description: "CrossBorder AI Workspace — 本地运行的跨境电商 AI 智能体工作台基础架构",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const ai = getProviderStatus();
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full">
        <AppShell aiLabel={ai.label} dbConfigured={Boolean(process.env.DATABASE_URL)}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/shell";
import { getTheme } from "@/lib/config/theme";
import { getProviderStatus } from "@/server/ai/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrossBorder AI Workspace",
  description: "跨境电商 AI 智能体工作台 · 本地运行",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const ai = getProviderStatus();
  const theme = await getTheme();

  return (
    <html lang="zh-CN" data-theme={theme} className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <AppShell aiLabel={ai.label} dbConfigured={Boolean(process.env.DATABASE_URL)}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

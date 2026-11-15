"use client";

import { useEffect, useState } from "react";
import { THEMES, THEME_COOKIE, type ThemeName } from "@/lib/config/theme-shared";

/**
 * 主题切换：点击只改 state，DOM 与 cookie 的同步放在 effect 里。
 * 服务端下次渲染直接带 data-theme，刷新不会闪回默认主题。
 */
export function ThemeSwitch({ initial }: { initial: ThemeName }) {
  const [theme, setTheme] = useState<ThemeName>(initial);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme !== theme) {
      root.dataset.theme = theme;
      document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
    }
  }, [theme]);

  return (
    <div className="theme-switch" role="group" aria-label="配色方案">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          title={t.hint}
          aria-pressed={theme === t.value}
          onClick={() => setTheme(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

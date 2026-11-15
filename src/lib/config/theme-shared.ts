/** 主题常量：客户端与服务端共用，不依赖 next/headers */
export type ThemeName = "dark" | "amber" | "indigo";

export const THEMES: { value: ThemeName; label: string; hint: string }[] = [
  { value: "dark", label: "深色", hint: "深色专业：信息密度高，AI 工具感" },
  { value: "amber", label: "琥珀", hint: "浅色琥珀：贸易与钱的味道" },
  { value: "indigo", label: "靛蓝", hint: "浅色靛蓝：稳重企业感" },
];

export const THEME_COOKIE = "cb_theme";
export const DEFAULT_THEME: ThemeName = "dark";

export function isTheme(value: string | undefined): value is ThemeName {
  return value === "dark" || value === "amber" || value === "indigo";
}

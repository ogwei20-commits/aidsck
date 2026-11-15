import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_THEME, isTheme, THEME_COOKIE, type ThemeName } from "./theme-shared";

/** 服务端读取主题，保证首屏不闪白/闪黑 */
export async function getTheme(): Promise<ThemeName> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}

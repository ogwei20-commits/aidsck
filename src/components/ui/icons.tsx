import type { SVGProps } from "react";

/** 项目锁定图标库：全部内联 SVG（16 / 20 / 24px），禁止 emoji 作为功能图标 */
export type IconName =
  | "grid" | "spark" | "folder" | "check" | "bot" | "flow" | "globe" | "layers"
  | "box" | "truck" | "calculator" | "book" | "trend" | "database" | "file"
  | "report" | "shield" | "settings" | "arrow" | "plus" | "clock" | "alert" | "link"
  | "list";

const P: Record<IconName, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  folder: "M3 6h6l2 2h10v11H3z",
  check: "M4 12l5 5L20 6",
  bot: "M5 8h14v10H5zM9 8V5h6v3M9 13h.01M15 13h.01M12 3v2",
  flow: "M4 5h5v4H4zM15 5h5v4h-5zM15 15h5v4h-5zM9 7h6M9 7v8h6",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18",
  layers: "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
  box: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18a2 2 0 100-4 2 2 0 000 4zM18 18a2 2 0 100-4 2 2 0 000 4z",
  calculator: "M5 3h14v18H5zM8 7h8M8 12h2M12 12h2M16 12h.01M8 16h2M12 16h2M16 16h.01",
  book: "M4 4h7a3 3 0 013 3v13a3 3 0 00-3-3H4zM20 4h-3a3 3 0 00-3 3v13a3 3 0 013-3h3z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  report: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  shield: "M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6zM9 12l2 2 4-4",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  link: "M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
};

export type IconSize = 16 | 20 | 24;

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: IconSize } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}

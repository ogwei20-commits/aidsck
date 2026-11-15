import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { citations, projects, reports } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { DATA_TYPE_LABEL, formatDateTime, isUuid } from "@/lib/utils/format";
import { escapeHtml, renderMarkdown } from "./report-render";

/**
 * 报告导出（文档 7.x「生成和导出」）。
 *
 * 两条通道，都只依赖本机能力，不调用任何付费服务：
 * - Markdown：正文本来就是 Markdown，原样带出 + 追加来源与数据说明附录。
 * - HTML：自包含单文件，打开即可读、即可打印。PDF 由浏览器打印管线产出
 *   （矢量、中文字体不丢、页边距与分页交还给浏览器），不引服务端 PDF 库。
 */

export type ExportFormat = "md" | "html";

export interface ExportCitation {
  sourceTitle: string;
  sourceUrl: string;
  quote: string;
  dataType: string;
}

export interface ReportArticle {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string;
  body: string;
  projectId: string | null;
  projectName: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  citations: ExportCitation[];
}

export const REPORT_KIND_LABEL: Record<string, string> = {
  research: "研究报告",
  finance: "财务分析",
  decision: "决策备忘",
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  review: "待审核",
  final: "已定稿",
  archived: "已归档",
};

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key ?? "未知";
}

/** 时间统一按东八区展示：导出的文件会被带走，不能依赖看文件那台机器的时区 */
export function formatStamp(value: Date | null): string {
  if (!value) return "—";
  return formatDateTime(value);
}

export async function loadReportArticle(userId: string, reportId: string): Promise<ReportArticle> {
  if (!isUuid(reportId)) {
    throw new AppError("REPORT_NOT_FOUND", "报告不存在", 404);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new AppError("REPORT_NOT_FOUND", "报告不存在，或不属于当前用户", 404);

  const cites = await db
    .select()
    .from(citations)
    .where(eq(citations.reportId, row.id))
    .orderBy(asc(citations.createdAt));

  let projectName: string | null = null;
  if (row.projectId) {
    const proj = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);
    projectName = proj[0]?.name ?? null;
  }

  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    body: row.body,
    projectId: row.projectId ?? null,
    projectName,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    citations: cites.map((c) => ({
      sourceTitle: c.sourceTitle,
      sourceUrl: c.sourceUrl,
      quote: c.quote,
      dataType: c.dataType,
    })),
  };
}

/** 文件名：保留中文，去掉各系统不允许的字符，避免下载后打不开 */
export function exportFileName(title: string, format: ExportFormat, stamp: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "");
  return `${safe || "报告"}_${stamp}.${format}`;
}

export function stampForFile(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function dataTypeLegend(): string {
  return (["R", "E", "P", "S", "U"] as const)
    .map((k) => `| ${k} | ${DATA_TYPE_LABEL[k]} |`)
    .join("\n");
}

/**
 * Markdown 导出。
 * 正文已经是 Markdown（工作流汇编时就是这个格式），所以只做两件事：
 * 缺标题时补一个，末尾追加附录。**不改写正文**——导出的内容必须和系统里看到的一致。
 */
export function buildMarkdown(
  article: ReportArticle,
  exportedAt = new Date(),
  formatLabel = "Markdown（.md 文件）",
): string {
  const parts: string[] = [];
  const body = article.body.trim();

  if (!body) {
    parts.push(`# ${article.title}`, "", "> 这份报告的正文还是空的。请先补齐正文，导出才有意义。");
  } else if (/^#\s/.test(body)) {
    parts.push(body);
  } else {
    parts.push(`# ${article.title}`, "", body);
  }

  parts.push("", "---", "", "## 附录 A · 来源清单", "");

  if (article.citations.length === 0) {
    parts.push(
      "本报告尚未登记来源条目。按本项目规则，没有来源的结论不得作为决策依据；",
      "如需对外使用，请先在报告里补齐来源与数据类型。",
    );
  } else {
    parts.push("| # | 来源 | 链接 | 引文 | 数据类型 |", "| --- | --- | --- | --- | --- |");
    article.citations.forEach((c, idx) => {
      const url = c.sourceUrl ? `[${c.sourceUrl}](${c.sourceUrl})` : "—";
      const quote = c.quote.replace(/\|/g, "\\|").replace(/\n/g, " ");
      parts.push(
        `| ${idx + 1} | ${c.sourceTitle || "—"} | ${url} | ${quote || "—"} | ${c.dataType} ${DATA_TYPE_LABEL[c.dataType as keyof typeof DATA_TYPE_LABEL] ?? ""} |`,
      );
    });
  }

  parts.push(
    "",
    "## 附录 B · 数据类型说明",
    "",
    "| 标记 | 含义 |",
    "| --- | --- |",
    dataTypeLegend(),
    "",
    "## 附录 C · 导出信息",
    "",
    `- 报告标题：${article.title}`,
    `- 类型：${label(REPORT_KIND_LABEL, article.kind)}`,
    `- 状态：${label(REPORT_STATUS_LABEL, article.status)}`,
    `- 一句话结论：${article.summary || "（未填写）"}`,
    `- 关联项目：${article.projectName ?? "（未关联）"}`,
    `- 报告 ID：${article.id}`,
    `- 创建时间：${formatStamp(article.createdAt)}`,
    `- 最后更新：${formatStamp(article.updatedAt)}`,
    `- 导出时间：${formatDateTime(exportedAt)}`,
    `- 导出格式：${formatLabel}`,
    "",
    "> 本文件由系统按报告原样导出，未做内容改写。",
    "> 若报告中出现「研究框架」类内容，说明该环节尚未接入模型，产出的是待办清单而非结论。",
    "",
  );

  return parts.join("\n");
}

const PRINT_CSS = `
:root{
  --ink:#111418; --text:#2b3138; --muted:#6b7480; --line:#d8dde3; --line-strong:#b9c1ca;
  --accent:#1f5f8b; --surface:#ffffff; --band:#f5f7f9;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; padding:32px 20px 72px; background:var(--band); color:var(--text);
  font-family:"Noto Serif CJK SC","Source Han Serif SC","Songti SC",Georgia,"Microsoft YaHei",serif;
  font-size:15px; line-height:1.85;
}
.page{max-width:820px; margin:0 auto; background:var(--surface); border:1px solid var(--line);
  border-top:0; border-radius:0 0 6px 6px; padding:44px 64px 64px;}
h1,h2,h3,h4,h5,h6{
  font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  color:var(--ink); line-height:1.4; letter-spacing:-.005em; break-after:avoid; page-break-after:avoid;
}
h1{font-size:24px; margin:0 0 26px; padding-bottom:15px; border-bottom:2px solid var(--ink);
   font-weight:700; text-wrap:balance; letter-spacing:0}
h2{font-size:19px; margin:38px 0 14px; padding-left:11px; border-left:3px solid var(--accent); font-weight:660}
h3{font-size:16px; margin:28px 0 10px; color:var(--ink); font-weight:640}
h4,h5,h6{font-size:15px; margin:22px 0 8px; color:var(--text); font-weight:600}
p{margin:0 0 14px}
ul,ol{margin:0 0 14px; padding-left:24px}
li{margin:3px 0}
li>ul,li>ol{margin:4px 0 6px}
strong{color:var(--ink); font-weight:660}
em{font-style:italic; color:var(--text)}
a{color:var(--accent); text-decoration:none; border-bottom:1px solid rgba(31,95,139,.3); word-break:break-all}
code{
  font-family:"JetBrains Mono",Menlo,Consolas,"Courier New",monospace; font-size:.86em;
  background:var(--band); border:1px solid var(--line); border-radius:3px; padding:1px 5px;
}
pre{background:var(--band); border:1px solid var(--line); border-radius:5px; padding:14px 16px;
  overflow:auto; margin:0 0 16px; break-inside:avoid}
pre code{background:none; border:0; padding:0; font-size:12.5px; line-height:1.7}
blockquote{
  margin:0 0 16px; padding:12px 18px; background:var(--band);
  border-left:3px solid var(--line-strong); color:var(--muted); break-inside:avoid;
}
blockquote p:last-child{margin-bottom:0}
hr{border:0; border-top:1px solid var(--line); margin:32px 0}
table{width:100%; border-collapse:collapse; margin:0 0 18px; font-size:13.5px; break-inside:avoid}
th,td{border:1px solid var(--line); padding:8px 11px; text-align:left; vertical-align:top}
th{background:var(--band); color:var(--ink); font-weight:640;
   font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
tbody tr:nth-child(even){background:#fafbfc}
/* 工具条固定在顶部而不是右下角：右下悬浮会挡住正文最后一段 */
.print-bar{
  position:sticky; top:0; z-index:10;
  display:flex; align-items:center; gap:12px; justify-content:space-between;
  max-width:820px; margin:0 auto -1px; padding:10px 16px;
  background:rgba(255,255,255,.94); backdrop-filter:blur(6px);
  border:1px solid var(--line); border-bottom:1px solid var(--line);
  border-radius:6px 6px 0 0;
  font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif; font-size:12px;
}
.print-bar .meta{color:var(--muted); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.print-bar button{
  flex:none; background:var(--accent); color:#fff; border:0; border-radius:4px; padding:8px 16px;
  font-size:12.5px; cursor:pointer; font-family:inherit;
}
.print-bar button:hover{filter:brightness(1.08)}
.print-bar button:focus-visible{outline:2px solid var(--ink); outline-offset:2px}
@page{size:A4; margin:18mm 16mm}
@media print{
  body{background:#fff; padding:0; font-size:11.5pt; line-height:1.75}
  .page{max-width:none; border:0; border-radius:0; padding:0; margin:0}
  .print-bar{display:none}
  a{color:#000; border:0}
  h1{font-size:20pt} h2{font-size:14pt; margin-top:22pt} h3{font-size:12pt}
  h2,h3,h4{break-after:avoid}
  p,li,blockquote,tr{orphans:3; widows:3}
  table{font-size:10pt}
}
@media (max-width:640px){
  body{padding:0 0 60px}
  .page{padding:26px 20px 40px; border-left:0; border-right:0; border-radius:0}
  .print-bar{max-width:none; margin:0; border-left:0; border-right:0; border-radius:0; padding:9px 14px}
  .print-bar .meta{font-size:11px}
  h1{font-size:20px}
}
`;

/**
 * HTML 导出：一份自包含文件（无外链、无图片请求），双击就能看，Ctrl+P 就能存 PDF。
 * 内联脚本只做一件事——点按钮调 window.print()，用 nonce 而不是放开 unsafe-inline。
 */
export function buildHtml(article: ReportArticle, exportedAt = new Date()): { html: string; nonce: string } {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const bodyHtml = renderMarkdown(
    buildMarkdown(article, exportedAt, "HTML 可打印页面（PDF 由浏览器打印管线生成）"),
  );

  const citationCount = article.citations.length;
  const meta = [
    label(REPORT_KIND_LABEL, article.kind),
    label(REPORT_STATUS_LABEL, article.status),
    `更新于 ${formatStamp(article.updatedAt)}`,
    citationCount > 0 ? `${citationCount} 条来源` : "未登记来源",
  ];

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="CrossBorder AI Workspace" />
<title>${escapeHtml(article.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="print-bar">
  <span class="meta">${meta.map(escapeHtml).join(" · ")}</span>
  <button type="button" id="print-btn">打印 / 存为 PDF</button>
</div>
<main class="page">
${bodyHtml}
</main>
<script nonce="${nonce}">
(function () {
  var btn = document.getElementById("print-btn");
  if (!btn) return;
  btn.addEventListener("click", function () { window.print(); });
  if (new URLSearchParams(location.search).get("print") === "1") {
    window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });
  }
})();
</script>
</body>
</html>`;

  return { html, nonce };
}

import "server-only";

/**
 * 受限 Markdown 渲染（报告导出用）。
 *
 * 为什么不用 marked / markdown-it：
 * 1. 报告正文里既有 Agent 产出也有用户输入，直出 HTML 就有 XSS 面；成熟库默认放行原始 HTML。
 * 2. 本项目只需要「标题 / 列表 / 引用 / 粗体 / 行内代码 / 链接 / 表格 / 分隔线」这几样，
 *    多出来的语法支持不是收益，是额外的攻击面与维护成本。
 *
 * 安全策略：**先整体转义，再还原受控标签**——任何来自正文的 `<` `>` 都变成实体，
 * 输出的标签只有本文件里写死的那几种。
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}

/** 只放行 http(s)、mailto 与站内相对路径；其余（javascript:、data: 等）退化为纯文本 */
export function isSafeHref(href: string): boolean {
  const value = href.trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:")) return true;
  return value.startsWith("/") && !value.startsWith("//");
}

/** 行内标记：粗体、行内代码、链接。输入必须是原始文本，函数内自行转义。 */
export function renderInline(raw: string): string {
  let out = escapeHtml(raw);
  // 行内代码先处理，避免代码里的星号被当成粗体
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // URL 允许一层括号（维基百科这类链接很常见），否则 `[t](a(b))` 会漏掉右括号
  out = out.replace(
    /\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g,
    (match, text: string, href: string) => {
      return isSafeHref(href) ? `<a href="${href}" rel="noopener noreferrer">${text}</a>` : text;
    },
  );
  return out;
}

const UL_RE = /^[-*+]\s+/;
const OL_RE = /^\d+[.)]\s+/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_SEP_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/;

function isBlockStart(line: string): boolean {
  const t = line.trim();
  return (
    !t ||
    t.startsWith("```") ||
    t.startsWith(">") ||
    HEADING_RE.test(t) ||
    HR_RE.test(t) ||
    UL_RE.test(t) ||
    OL_RE.test(t) ||
    t.startsWith("|")
  );
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

/**
 * 块级渲染。刻意不处理 HTML 块、脚注、定义列表等——报告用不到，
 * 支持了反而给未来留一个「正文可以注入结构」的口子。
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // 代码块：内容整体转义，不解析行内标记
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过收尾的 ```
      const cls = lang ? ` class="lang-${escapeHtml(lang).replace(/[^a-z0-9-]/gi, "")}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    // 引用：连续 > 行整体递归，保留内部结构
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    // 表格：表头 + 分隔行 + 数据行
    if (trimmed.startsWith("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].trim())) {
      const head = splitRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const thead = head.map((c) => `<th>${renderInline(c)}</th>`).join("");
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`);
      continue;
    }

    // 列表：项内缩进续行合并进同一项，用 <br /> 保留原始换行
    if (UL_RE.test(trimmed) || OL_RE.test(trimmed)) {
      const ordered = OL_RE.test(trimmed);
      const items: string[] = [];
      const itemRe = ordered ? OL_RE : UL_RE;
      while (i < lines.length) {
        const cur = lines[i];
        const curTrimmed = cur.trim();
        if (itemRe.test(curTrimmed)) {
          items.push(curTrimmed.replace(itemRe, ""));
          i += 1;
          continue;
        }
        // 续行：缩进且不是新的块起点
        if (items.length > 0 && /^\s+/.test(cur) && curTrimmed && !itemRe.test(curTrimmed)) {
          items[items.length - 1] += `<br />${renderInline(curTrimmed)}`;
          i += 1;
          continue;
        }
        break;
      }
      // 首项文本还没做行内渲染，这里统一处理（续行已渲染过，靠占位符避免二次转义）
      const rendered = items.map((text) => {
        const parts = text.split("<br />");
        return `<li>${parts
          .map((p, idx) => (idx === 0 ? renderInline(p) : p))
          .join("<br />")}</li>`;
      });
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${rendered.join("")}</${tag}>`);
      continue;
    }

    // 段落：连续非块起始行合并
    const buf: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i]) && lines[i].trim()) {
      buf.push(lines[i].trim());
      i += 1;
    }
    if (buf.length > 0) out.push(`<p>${buf.map(renderInline).join("<br />")}</p>`);
  }

  return out.join("\n");
}

/** 正文压成一段纯文本，用于摘要与检索，不用于展示 */
export function toPlainText(md: string, maxLength = 200): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[|*`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

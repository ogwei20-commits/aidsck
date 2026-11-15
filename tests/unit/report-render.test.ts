import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  isSafeHref,
  renderInline,
  renderMarkdown,
  toPlainText,
} from "@/server/services/report-render";
import {
  buildHtml,
  buildMarkdown,
  exportFileName,
  type ReportArticle,
} from "@/server/services/reports";

function article(overrides: Partial<ReportArticle> = {}): ReportArticle {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "美国宠物零食市场进入可行性报告",
    kind: "research",
    status: "draft",
    summary: "单件净利不足，暂缓",
    body: "# 标题\n\n正文第一段。\n",
    projectId: null,
    projectName: null,
    createdAt: new Date("2026-11-01T02:00:00Z"),
    updatedAt: new Date("2026-11-15T04:30:00Z"),
    citations: [],
    ...overrides,
  };
}

describe("转义与行内标记", () => {
  it("把 HTML 元字符全转掉，正文里的标签不可能变成真标签", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("粗体与行内代码正常渲染", () => {
    expect(renderInline("这是**重点**和`code`")).toBe("这是<strong>重点</strong>和<code>code</code>");
  });

  it("正文里写 <img onerror> 只输出文本，不生成标签", () => {
    const out = renderInline('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("javascript: 链接被拒，退化为纯文本", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(renderInline("[点我](javascript:alert(1))")).toBe("点我");
  });

  it("https 链接保留并带 rel", () => {
    expect(renderInline("[来源](https://example.com/a)")).toBe(
      '<a href="https://example.com/a" rel="noopener noreferrer">来源</a>',
    );
  });
});

describe("块级渲染", () => {
  it("标题与段落", () => {
    expect(renderMarkdown("# 一级\n\n正文")).toBe("<h1>一级</h1>\n<p>正文</p>");
  });

  it("无序列表与有序列表分开", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("列表项的缩进续行仍属于同一项", () => {
    const md = "1. 这个问题能不能拆\n   所需证据：目标原文\n   期望数据类型：U";
    const html = renderMarkdown(md);
    expect(html.match(/<li>/g)).toHaveLength(1);
    expect(html).toContain("所需证据：目标原文");
    expect(html).toContain("<br />");
  });

  it("引用块内部仍解析标题这类结构", () => {
    const html = renderMarkdown("> 说明：这不是结论\n> 只是框架");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("这不是结论");
  });

  it("表格渲染成 th / td", () => {
    const md = "| 标记 | 含义 |\n| --- | --- |\n| R | 真实数据 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<th>标记</th>");
    expect(html).toContain("<td>真实数据</td>");
  });

  it("代码块内容不再解析行内标记", () => {
    const html = renderMarkdown("```\n**不该变粗**\n```");
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("<strong>");
  });

  it("纯文本摘要去掉标记符号", () => {
    expect(toPlainText("## 一、目标\n\n- 点一\n- 点二", 100)).toBe("一、目标 点一 点二");
  });
});

describe("Markdown 导出", () => {
  it("正文自带一级标题时不再重复加标题", () => {
    const md = buildMarkdown(article());
    expect(md.match(/^# 美国宠物零食/gm)).toBeNull();
    expect(md.startsWith("# 标题")).toBe(true);
  });

  it("正文没有标题时补一个", () => {
    const md = buildMarkdown(article({ body: "只有正文" }));
    expect(md.startsWith("# 美国宠物零食市场进入可行性报告")).toBe(true);
  });

  it("正文为空时明确写出为空，不生成一个看似成稿的空文件", () => {
    const md = buildMarkdown(article({ body: "" }));
    expect(md).toContain("正文还是空的");
  });

  it("没有来源时写清楚不能作为决策依据", () => {
    const md = buildMarkdown(article());
    expect(md).toContain("尚未登记来源条目");
    expect(md).toContain("不得作为决策依据");
  });

  it("有来源时输出表格并带数据类型", () => {
    const md = buildMarkdown(
      article({
        citations: [
          { sourceTitle: "亚马逊 2025 年报", sourceUrl: "https://example.com/a", quote: "类目增长 12%", dataType: "R" },
        ],
      }),
    );
    expect(md).toContain("| # | 来源 | 链接 | 引文 | 数据类型 |");
    expect(md).toContain("亚马逊 2025 年报");
    expect(md).toContain("R 真实数据");
  });

  it("引文里的竖线不会把表格撑破", () => {
    const md = buildMarkdown(
      article({ citations: [{ sourceTitle: "s", sourceUrl: "", quote: "a|b", dataType: "U" }] }),
    );
    expect(md).toContain("a\\|b");
  });

  it("附录 C 带上报告 ID 与导出时间", () => {
    const md = buildMarkdown(article(), new Date("2026-11-15T05:30:00Z"));
    expect(md).toContain("报告 ID：11111111-2222-3333-4444-555555555555");
    expect(md).toContain("导出时间：");
    expect(md).toContain("导出格式：Markdown");
  });

  it("走 HTML 通道时附录不能写成「导出格式：Markdown」", () => {
    const { html } = buildHtml(article());
    expect(html).toContain("导出格式：HTML 可打印页面");
    expect(html).not.toContain("导出格式：Markdown");
  });
});

describe("HTML 导出", () => {
  it("正文里的脚本不会变成可执行标签", () => {
    const { html } = buildHtml(article({ body: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("每次导出 nonce 不同，脚本带 nonce", () => {
    const a = buildHtml(article());
    const b = buildHtml(article());
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.html).toContain(`<script nonce="${a.nonce}">`);
  });

  it("是自包含文件：没有外链资源", () => {
    const { html } = buildHtml(article());
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<img[^>]+src="http/i);
  });

  it("打印时隐藏浮动工具栏", () => {
    const { html } = buildHtml(article());
    expect(html).toContain("@media print");
    expect(html).toContain(".print-bar{display:none}");
  });
});

describe("导出文件名", () => {
  it("保留中文并去掉非法字符", () => {
    expect(exportFileName('报告: "测试" / 2026', "md", "20261115-1340")).toBe(
      "报告 测试 2026_20261115-1340.md",
    );
  });

  it("标题全被清理掉时给兜底名", () => {
    expect(exportFileName("///", "html", "20261115-1340")).toBe("报告_20261115-1340.html");
  });

  it("超长标题被截断，不撑爆文件系统", () => {
    const name = exportFileName("长".repeat(200), "md", "20261115-1340");
    expect(name.length).toBeLessThanOrEqual(100);
  });
});

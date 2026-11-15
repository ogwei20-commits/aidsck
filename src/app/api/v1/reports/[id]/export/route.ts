import { getEnv } from "@/lib/config/env";
import { AppError, fail } from "@/lib/errors/api";
import {
  buildHtml,
  buildMarkdown,
  exportFileName,
  loadReportArticle,
  stampForFile,
  type ExportFormat,
} from "@/server/services/reports";

/**
 * GET /api/v1/reports/:id/export?format=md|html|pdf
 *
 * md   → 下载 .md 文件（正文原样 + 附录）
 * html → 自包含单文件，可直接读、可 Ctrl+P 存 PDF
 * pdf  → 307 跳到 html&print=1，由浏览器打印管线生成（不做服务端 PDF，避免引入付费服务与字体依赖）
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(fileName: string): string {
  // RFC 5987：中文文件名必须走 filename*，否则某些浏览器会乱码或截断
  return `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const raw = (url.searchParams.get("format") ?? "md").toLowerCase();
    const userId = getEnv().APP_USER_ID;

    if (raw === "pdf") {
      const target = new URL(request.url);
      target.searchParams.set("format", "html");
      target.searchParams.set("print", "1");
      return Response.redirect(target, 307);
    }

    if (raw !== "md" && raw !== "html") {
      throw new AppError(
        "EXPORT_FORMAT_UNSUPPORTED",
        `不支持的导出格式「${raw}」。可用：md（Markdown 文件）、html（可打印页面）、pdf（浏览器打印）。`,
        422,
      );
    }

    const format = raw as ExportFormat;
    const article = await loadReportArticle(userId, id);
    const exportedAt = new Date();
    const fileName = exportFileName(article.title, format, stampForFile(exportedAt));

    if (format === "md") {
      const md = buildMarkdown(article, exportedAt);
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": contentDisposition(fileName),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const { html, nonce } = buildHtml(article, exportedAt);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // inline：要能在浏览器里直接用打印；文件名仍给出，便于另存
        "Content-Disposition": contentDisposition(fileName).replace("attachment", "inline"),
        "Content-Security-Policy": [
          "default-src 'none'",
          "img-src data:",
          "style-src 'unsafe-inline'",
          `script-src 'nonce-${nonce}'`,
          "base-uri 'none'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join("; "),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}

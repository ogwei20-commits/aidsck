import "server-only";
import { createRequire } from "node:module";
import path from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { fileChunks, files } from "@/db/schema";
import { AppError } from "@/lib/errors/api";
import { chunkText, MAX_EXTRACT_CHARS, normalizeText } from "@/lib/text/chunk";
import { readFileContent } from "@/server/services/files";

/**
 * 文件内容提取 → 切块 → 落库。
 *
 * 边界说清楚，避免「看起来能搜、其实搜不到」：
 * - 文本类（txt/md/csv）直接读；PDF 走 pdfjs；Word 走 mammoth。
 * - xlsx/pptx/图片/zip 明确标 unsupported，不假装成功。
 * - 扫描版 PDF 提取不出文字，标 empty，提示「可能是扫描件」，而不是 ok + 0 字。
 *
 * 状态必须落库：只看「有没有 chunk」分不清「没点过」和「每次都失败」。
 */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/json",
]);

/** 单次最多解析多少页，防止一份几百页的 PDF 把请求卡死 */
const MAX_PDF_PAGES = 200;

export const EXTRACTABLE_MIMES = [PDF_MIME, DOCX_MIME, ...TEXT_MIMES];

export function isExtractable(mimeType: string): boolean {
  return mimeType === PDF_MIME || mimeType === DOCX_MIME || TEXT_MIMES.has(mimeType);
}

export type ExtractStatus = "pending" | "ok" | "empty" | "failed" | "unsupported";

export interface IndexResult {
  fileId: string;
  filename: string;
  status: ExtractStatus;
  charCount: number;
  chunkCount: number;
  error: string;
  truncated: boolean;
}

/**
 * 以项目根目录的 package.json 为锚点创建 require。
 * 不能用 createRequire(import.meta.url)：Next 生产打包后 import.meta.url 会被
 * 替换成模块 ID（一个数字），报错 "path argument must be of type string"。
 */
function nodeRequire(): NodeRequire {
  return createRequire(path.join(process.cwd(), "package.json"));
}

function shortError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const first = raw.split("\n")[0].trim();
  return (first || "未知错误").slice(0, 200);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = nodeRequire();
  // 中文 PDF 用 CID 字体，必须给 cMap 目录，否则静默提取出空文本（实测踩过）
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    cMapUrl: path.join(root, "cmaps") + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(root, "standard_fonts") + path.sep,
  });
  const doc = await task.promise;

  const lines: string[] = [];
  try {
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        line += item.str;
        if ("hasEOL" in item && item.hasEOL) {
          if (line.trim()) lines.push(line);
          line = "";
        }
      }
      if (line.trim()) lines.push(line);
    }
  } finally {
    // v6 的清理入口在 loadingTask 上，PDFDocumentProxy 已不暴露 destroy()
    await task.destroy();
  }
  return lines.join("\n");
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const require = nodeRequire();
  const mammoth = require("mammoth") as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

/** 从原始字节里取出可检索的纯文本。供单测直接调用。 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) return extractPdf(buffer);
  if (mimeType === DOCX_MIME) return extractDocx(buffer);
  if (TEXT_MIMES.has(mimeType)) return buffer.toString("utf8");
  throw new AppError("EXTRACT_UNSUPPORTED", `不支持解析 ${mimeType}`, 422);
}

async function setStatus(
  fileId: string,
  status: ExtractStatus,
  extra: { error?: string; charCount?: number; extractedAt?: Date | null } = {},
): Promise<void> {
  const db = getDb();
  await db
    .update(files)
    .set({
      extractStatus: status,
      extractError: extra.error ?? "",
      charCount: extra.charCount ?? 0,
      extractedAt: extra.extractedAt ?? null,
    })
    .where(eq(files.id, fileId));
}

/**
 * 给单个文件重建索引。可重复调用：每次先删旧块，不会越点越多。
 * 明确的结论（unsupported / empty）返回 200；真异常记 failed 后抛出，让调用方看到原因。
 */
export async function indexFile(userId: string, fileId: string): Promise<IndexResult> {
  const db = getDb();
  const { record, buffer } = await readFileContent(userId, fileId);
  const base = { fileId, filename: record.filename };

  if (!isExtractable(record.mimeType)) {
    await setStatus(fileId, "unsupported", { error: "该类型不解析（表格/演示/图片/压缩包只存原件）" });
    return { ...base, status: "unsupported", charCount: 0, chunkCount: 0, error: "该类型不解析", truncated: false };
  }

  let raw = "";
  try {
    raw = await extractText(buffer, record.mimeType);
  } catch (error) {
    const message = `解析失败：${shortError(error)}。文件本身仍可下载，可转存为文本后重新上传。`;
    await setStatus(fileId, "failed", { error: message });
    throw new AppError("EXTRACT_FAILED", message, 422);
  }

  const text = normalizeText(raw);
  // 先删旧块：与「只追加」的汇率不同，索引重建必须替换，否则同一段内容会命中多次
  await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));

  if (!text) {
    await setStatus(fileId, "empty", {
      error: "没提取到文字。若是扫描版 PDF，需要 OCR；本系统不做 OCR。",
    });
    return { ...base, status: "empty", charCount: 0, chunkCount: 0, error: "", truncated: false };
  }

  const truncated = text.length > MAX_EXTRACT_CHARS;
  const limited = truncated ? text.slice(0, MAX_EXTRACT_CHARS) : text;
  const chunks = chunkText(limited);

  if (chunks.length > 0) {
    await db.insert(fileChunks).values(
      chunks.map((content, chunkIndex) => ({ fileId, chunkIndex, content })),
    );
  }

  await setStatus(fileId, "ok", {
    charCount: limited.length,
    extractedAt: new Date(),
    error: truncated ? `原文超过 ${MAX_EXTRACT_CHARS.toLocaleString("zh-CN")} 字，只索引了前一部分` : "",
  });

  return {
    ...base,
    status: "ok",
    charCount: limited.length,
    chunkCount: chunks.length,
    error: truncated ? "原文过长，已截断索引" : "",
    truncated,
  };
}

/** 全库待解析文件数（不受列表分页影响，按钮上的数字要准） */
export async function countPendingFiles(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.extractStatus, "pending")));
  return row?.count ?? 0;
}

export interface BatchIndexResult {
  processed: number;
  ok: number;
  empty: number;
  unsupported: number;
  failed: number;
  results: IndexResult[];
}

/** 批量解析所有「未解析」的文件。单个失败不中断整批。 */
export async function indexPendingFiles(userId: string, limit = 20): Promise<BatchIndexResult> {
  const db = getDb();
  const pending = await db
    .select({ id: files.id, filename: files.filename })
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.extractStatus, "pending")))
    .orderBy(asc(files.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  const summary: BatchIndexResult = {
    processed: 0,
    ok: 0,
    empty: 0,
    unsupported: 0,
    failed: 0,
    results: [],
  };

  for (const file of pending) {
    summary.processed += 1;
    try {
      const result = await indexFile(userId, file.id);
      summary.results.push(result);
      if (result.status === "ok") summary.ok += 1;
      else if (result.status === "empty") summary.empty += 1;
      else if (result.status === "unsupported") summary.unsupported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        fileId: file.id,
        filename: file.filename,
        status: "failed",
        charCount: 0,
        chunkCount: 0,
        error: shortError(error),
        truncated: false,
      });
    }
  }

  return summary;
}

/** 清掉某个文件的索引并回到未解析状态（删除文件的级联由外键处理） */
export async function clearFileIndex(userId: string, fileId: string): Promise<void> {
  const db = getDb();
  const [record] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);
  if (!record) throw new AppError("FILE_NOT_FOUND", "文件不存在或不属于当前用户", 404);

  await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
  await setStatus(fileId, "pending", { extractedAt: null });
}

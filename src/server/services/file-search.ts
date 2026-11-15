import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { fileChunks, files } from "@/db/schema";
import { makeSnippet } from "@/lib/text/chunk";
import { toLikePattern } from "@/modules/store";

/**
 * 文件全文检索。
 *
 * 用 ILIKE 而不是 Postgres 的 tsvector：
 * 中文分词要装 zhparser / pg_bigm 扩展，本地环境不该为了一个搜索框引入系统级依赖；
 * 单机文件量（几百份、几千个块）用 ILIKE 足够，且中文子串匹配天然正确。
 * % 与 _ 必须转义，否则用户搜「50%」会变成「以 50 开头」——复用列表搜索同一口径。
 * 不显式写 ESCAPE 子句：PostgreSQL 默认以反斜杠为 LIKE 转义符，
 * 写了 ESCAPE '' 反而会禁用转义（且 JS 模板字符串容易把 '\' 吃掉）。
 */

export interface SearchChunkHit {
  chunkIndex: number;
  snippet: string;
}

export interface FileSearchGroup {
  fileId: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  filenameMatch: boolean;
  chunks: SearchChunkHit[];
  /** 该文件的总命中块数（展示的片段最多 3 条） */
  totalHits: number;
}

export interface FileSearchResult {
  q: string;
  fileCount: number;
  hitCount: number;
  groups: FileSearchGroup[];
  /** 一个块都没建过时给页面一句提示，别让人以为搜索坏了 */
  indexedFiles: number;
}

const MAX_SNIPPETS_PER_FILE = 3;
const MAX_SCAN_ROWS = 300;

function iso(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export async function searchFiles(userId: string, keyword: string): Promise<FileSearchResult> {
  const q = keyword.trim().slice(0, 100);
  const db = getDb();

  const [indexed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.extractStatus, "ok")));

  const empty: FileSearchResult = {
    q,
    fileCount: 0,
    hitCount: 0,
    groups: [],
    indexedFiles: indexed?.count ?? 0,
  };
  if (!q) return empty;

  const pattern = toLikePattern(q);

  // 内容命中：join 回 files 带上归属过滤，绝不跨用户返回片段
  const contentRows = await db
    .select({
      fileId: fileChunks.fileId,
      chunkIndex: fileChunks.chunkIndex,
      content: fileChunks.content,
      filename: files.filename,
      mimeType: files.mimeType,
      createdAt: files.createdAt,
    })
    .from(fileChunks)
    .innerJoin(files, eq(files.id, fileChunks.fileId))
    .where(and(eq(files.userId, userId), sql`${fileChunks.content} ilike ${pattern}`))
    .orderBy(desc(files.createdAt), asc(fileChunks.chunkIndex))
    .limit(MAX_SCAN_ROWS);

  // 文件名命中：即使内容没建索引，文件名本身也应该能被搜到
  const nameRows = await db
    .select({
      id: files.id,
      filename: files.filename,
      mimeType: files.mimeType,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(and(eq(files.userId, userId), sql`${files.filename} ilike ${pattern}`))
    .limit(100);

  const groups = new Map<string, FileSearchGroup>();

  for (const row of nameRows) {
    groups.set(row.id, {
      fileId: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      createdAt: iso(row.createdAt),
      filenameMatch: true,
      chunks: [],
      totalHits: 0,
    });
  }

  for (const row of contentRows) {
    let group = groups.get(row.fileId);
    if (!group) {
      group = {
        fileId: row.fileId,
        filename: row.filename,
        mimeType: row.mimeType,
        createdAt: iso(row.createdAt),
        filenameMatch: false,
        chunks: [],
        totalHits: 0,
      };
      groups.set(row.fileId, group);
    }
    group.totalHits += 1;
    if (group.chunks.length < MAX_SNIPPETS_PER_FILE) {
      group.chunks.push({
        chunkIndex: row.chunkIndex,
        snippet: makeSnippet(row.content, q),
      });
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) =>
      Number(b.filenameMatch) - Number(a.filenameMatch) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.totalHits - a.totalHits,
  );

  return {
    q,
    fileCount: sorted.length,
    hitCount: contentRows.length,
    groups: sorted,
    indexedFiles: indexed?.count ?? 0,
  };
}

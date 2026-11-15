import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLogs, fileChunks, files } from "@/db/schema";
import { DEFAULT_USER_ID, resetEnvCache } from "@/lib/config/env";
import { saveUpload } from "@/server/services/files";
import { ensureLocalUser } from "@/server/services/workspace";
import {
  clearFileIndex,
  countPendingFiles,
  indexFile,
  indexPendingFiles,
} from "@/server/services/file-extract";
import { searchFiles } from "@/server/services/file-search";

const uid = DEFAULT_USER_ID;
const TEST_UPLOAD_DIR = "storage/uploads/__test_extract__";
const createdIds: string[] = [];

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function upload(bytes: Uint8Array, name: string, type: string) {
  const result = await saveUpload(uid, makeFile(bytes, name, type), "[测试] 索引");
  createdIds.push(result.id);
  return result;
}

describe("文件解析与全文检索", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
    resetEnvCache();
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdIds.length > 0) {
      await db.delete(fileChunks).where(inArray(fileChunks.fileId, createdIds));
      await db.delete(files).where(inArray(files.id, createdIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds));
    }
    await rm(path.resolve(process.cwd(), TEST_UPLOAD_DIR), { recursive: true, force: true });
    await closeDb();
  });

  it("txt 提取 → 切块 → 中文关键词能搜到片段", async () => {
    const text = "结论：Shopee 马来西亚站佣金 8%–12%，单件净利 6.14 美元，保本单量 326 件。\n".repeat(12);
    const file = await upload(new TextEncoder().encode(text), "[测试] 佣金说明.txt", "text/plain");

    const result = await indexFile(uid, file.id);
    expect(result.status).toBe("ok");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.chunkCount).toBeGreaterThan(0);

    const found = await searchFiles(uid, "保本单量");
    const group = found.groups.find((g) => g.fileId === file.id);
    expect(group).toBeTruthy();
    expect(group!.chunks[0].snippet).toContain("保本单量");
    expect(group!.totalHits).toBeGreaterThan(0);
  });

  it("重复提取不会让块数翻倍", async () => {
    const file = await upload(
      new TextEncoder().encode("可重复索引的内容。".repeat(60)),
      "[测试] 重复.txt",
      "text/plain",
    );
    const first = await indexFile(uid, file.id);
    const second = await indexFile(uid, file.id);
    expect(second.chunkCount).toBe(first.chunkCount);

    const db = getDb();
    const rows = await db.select().from(fileChunks).where(eq(fileChunks.fileId, file.id));
    expect(rows.length).toBe(first.chunkCount);
  });

  it("清除索引回到 pending，搜不到正文但文件名仍可命中", async () => {
    const file = await upload(
      new TextEncoder().encode("只有正文里有独一无二词 ZZZQQQ"),
      "[测试] 可清除索引.txt",
      "text/plain",
    );
    await indexFile(uid, file.id);
    await clearFileIndex(uid, file.id);

    const db = getDb();
    expect((await db.select().from(fileChunks).where(eq(fileChunks.fileId, file.id))).length).toBe(0);
    const [record] = await db.select().from(files).where(eq(files.id, file.id));
    expect(record.extractStatus).toBe("pending");

    expect((await searchFiles(uid, "ZZZQQQ")).groups.some((g) => g.fileId === file.id)).toBe(false);
    const byName = await searchFiles(uid, "可清除索引");
    expect(byName.groups.find((g) => g.fileId === file.id)?.filenameMatch).toBe(true);
  });

  it("PDF 中文能被真实抽出（CID 字体 cMap 生效）", async () => {
    const bytes = await readFile(path.resolve(process.cwd(), "tests/fixtures/sample.pdf"));
    const file = await upload(new Uint8Array(bytes), "[测试] 市场报告.pdf", "application/pdf");
    const result = await indexFile(uid, file.id);
    expect(result.status).toBe("ok");
    expect(result.charCount).toBeGreaterThan(10);

    const found = await searchFiles(uid, "保本单量");
    expect(found.groups.some((g) => g.fileId === file.id)).toBe(true);
  });

  it("Word 正文能被真实抽出", async () => {
    const bytes = await readFile(path.resolve(process.cwd(), "tests/fixtures/sample.docx"));
    const file = await upload(
      new Uint8Array(bytes),
      "[测试] 选品报告.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const result = await indexFile(uid, file.id);
    expect(result.status).toBe("ok");

    const found = await searchFiles(uid, "马来西亚站佣金");
    expect(found.groups.some((g) => g.fileId === file.id)).toBe(true);
  });

  it("不支持的类型标 unsupported，不假装成功", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const file = await upload(png, "[测试] 截图.png", "image/png");
    const result = await indexFile(uid, file.id);
    expect(result.status).toBe("unsupported");
    expect(result.chunkCount).toBe(0);

    const db = getDb();
    const [record] = await db.select().from(files).where(eq(files.id, file.id));
    expect(record.extractError).toContain("不解析");
  });

  it("% 与 _ 是普通字符，不会被当成通配符", async () => {
    const file = await upload(new TextEncoder().encode("佣金 50% 与编号 A_B"), "[测试] 转义.txt", "text/plain");
    await indexFile(uid, file.id);

    expect((await searchFiles(uid, "50%")).groups.some((g) => g.fileId === file.id)).toBe(true);
    expect((await searchFiles(uid, "A_B")).groups.some((g) => g.fileId === file.id)).toBe(true);
    // 下划线若未转义会匹配任意字符，AXB 不该命中
    expect((await searchFiles(uid, "AXB")).groups.some((g) => g.fileId === file.id)).toBe(false);
  });

  it("批量解析处理所有 pending，且跨用户读不到", async () => {
    await upload(new TextEncoder().encode("批量一"), "[测试] 批量一.txt", "text/plain");
    await upload(new TextEncoder().encode("批量二"), "[测试] 批量二.txt", "text/plain");
    const before = await countPendingFiles(uid);
    expect(before).toBeGreaterThanOrEqual(2);

    const result = await indexPendingFiles(uid, 20);
    expect(result.processed).toBe(before);
    expect(result.ok).toBeGreaterThanOrEqual(2);

    const other = "00000000-0000-4000-8000-0000000000bb";
    await expect(indexFile(other, createdIds[0])).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });
});

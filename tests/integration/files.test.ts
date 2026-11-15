import { rm } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLogs, files } from "@/db/schema";
import { DEFAULT_USER_ID, resetEnvCache } from "@/lib/config/env";
import {
  getFileRecord,
  listFiles,
  readFileContent,
  resolveStoredPath,
  saveUpload,
} from "@/server/services/files";
import { ensureLocalUser } from "@/server/services/workspace";

const uid = DEFAULT_USER_ID;
const TEST_UPLOAD_DIR = "storage/uploads/__test__";
const createdIds: string[] = [];

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("文件上传与下载（F-12）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    // 指到独立目录，避免污染真实上传区
    process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
    resetEnvCache();
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (createdIds.length > 0) {
      await db.delete(files).where(inArray(files.id, createdIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds));
    }
    await rm(path.resolve(process.cwd(), TEST_UPLOAD_DIR), { recursive: true, force: true });
    await closeDb();
  });

  it("正常上传：写盘、算校验和、落库、写审计", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const result = await saveUpload(uid, makeFile(bytes, "报价单.png", "image/png"), "供应商比价");
    createdIds.push(result.id);

    expect(result.sizeBytes).toBe(bytes.byteLength);
    expect(result.checksum).toHaveLength(64);
    expect(result.storagePath).toMatch(new RegExp(`^${uid}/\\d{6}/[0-9a-f-]{36}\\.png$`));

    // 磁盘上真的存在
    const absolute = resolveStoredPath(result.storagePath);
    const { buffer } = await readFileContent(uid, result.id);
    expect(buffer.byteLength).toBe(bytes.byteLength);

    // 数据库有记录
    const record = await getFileRecord(uid, result.id);
    expect(record.filename).toBe("报价单.png");
    expect(record.mimeType).toBe("image/png");
    expect(record.purpose).toBe("供应商比价");

    // 审计日志有记录
    const db = getDb();
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, result.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].entityType).toBe("file");
    expect(absolute).toContain("__test__");
  });

  it("拒绝不在白名单的扩展名", async () => {
    await expect(
      saveUpload(uid, makeFile(new Uint8Array([1, 2, 3]), "virus.exe", "application/octet-stream")),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("拒绝扩展名与声明类型不匹配的文件（防伪装）", async () => {
    await expect(
      saveUpload(uid, makeFile(new Uint8Array([1, 2, 3]), "fake.pdf", "image/png")),
    ).rejects.toMatchObject({ code: "MIME_MISMATCH" });
  });

  it("拒绝空文件", async () => {
    await expect(saveUpload(uid, makeFile(new Uint8Array(0), "empty.txt", "text/plain"))).rejects.toMatchObject(
      { code: "EMPTY_FILE" },
    );
  });

  it("拒绝超过 20MB 的文件", async () => {
    const big = new Uint8Array(21 * 1024 * 1024);
    await expect(saveUpload(uid, makeFile(big, "big.txt", "text/plain"))).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  }, 20000);

  it("路径穿越被拒绝", () => {
    expect(() => resolveStoredPath("../../etc/passwd")).toThrow(/不合法|PATH_TRAVERSAL/);
    expect(() => resolveStoredPath("/etc/passwd")).toThrow(/不合法|PATH_TRAVERSAL/);
  });

  it("磁盘缺件时明确报错，不返回空文件冒充成功", async () => {
    const result = await saveUpload(uid, makeFile(new Uint8Array([9, 9, 9]), "gone.txt", "text/plain"));
    createdIds.push(result.id);

    // 模拟原件被手动删除
    const absolute = resolveStoredPath(result.storagePath);
    await rm(absolute, { force: true });

    await expect(readFileContent(uid, result.id)).rejects.toMatchObject({
      code: "FILE_MISSING_ON_DISK",
    });
  });

  it("列表只返回当前用户的文件", async () => {
    const list = await listFiles(uid);
    expect(list.every((f) => f.userId === uid)).toBe(true);
    expect(list.some((f) => createdIds.includes(f.id))).toBe(true);
  });

  it("他人的文件读不到", async () => {
    const otherUser = "00000000-0000-0000-0000-0000000000aa";
    await expect(getFileRecord(otherUser, createdIds[0])).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });
});

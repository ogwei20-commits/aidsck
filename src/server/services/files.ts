import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { getEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors/api";
import { MAX_UPLOAD_BYTES, UPLOAD_WHITELIST } from "@/lib/validation/schemas";
import { writeAudit } from "@/server/audit/logger";

/**
 * 文件服务（文档 4.2 / 9.3）。
 *
 * 安全要点：
 * 1. 磁盘文件名一律用 uuid 重命名，原始名只存数据库——避免路径穿越与特殊字符。
 * 2. 扩展名与 MIME 双重校验，任一不匹配即拒绝（防伪装）。
 * 3. 读取时把最终路径 resolve 后校验是否仍在上传根目录内，防止历史脏数据越界。
 * 4. 不解析、不执行文件内容；第一阶段只做存储与元数据。
 */

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/markdown": "md",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

function uploadRoot(): string {
  return path.resolve(process.cwd(), getEnv().UPLOAD_DIR);
}

/** 把相对路径解析成绝对路径，并确保没有逃出上传根目录 */
export function resolveStoredPath(storagePath: string): string {
  const root = uploadRoot();
  const target = path.resolve(root, storagePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("PATH_TRAVERSAL", "文件路径不合法", 400);
  }
  return target;
}

export interface UploadResult {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  purpose: string;
  createdAt: Date;
}

export async function saveUpload(userId: string, file: File, purpose = ""): Promise<UploadResult> {
  const db = getDb();

  // ── 校验大小 ──────────────────────────────────────────────
  if (file.size === 0) {
    throw new AppError("EMPTY_FILE", "上传的文件是空的", 422);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `文件 ${(file.size / 1024 / 1024).toFixed(1)} MB 超过上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
      413,
    );
  }

  // ── 校验扩展名与类型（双重）────────────────────────────────
  const original = file.name || "unnamed";
  const ext = path.extname(original).replace(/^\./, "").toLowerCase();
  const allowedMimes = UPLOAD_WHITELIST[ext];
  if (!allowedMimes) {
    throw new AppError(
      "FILE_TYPE_NOT_ALLOWED",
      `不支持 .${ext || "(无扩展名)"} 文件。允许的类型：${Object.keys(UPLOAD_WHITELIST).join("、")}`,
      415,
    );
  }
  const declaredMime = (file.type || "").toLowerCase();
  if (!allowedMimes.includes(declaredMime)) {
    throw new AppError(
      "MIME_MISMATCH",
      `文件扩展名 .${ext} 与实际类型 ${declaredMime || "未知"} 不匹配，已拒绝上传`,
      415,
    );
  }

  // ── 落盘：uuid 重命名 + 按用户与月份分目录 ──────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeExt = EXT_BY_MIME[declaredMime] ?? ext;
  const now = new Date();
  const folder = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const storagePath = `${userId}/${folder}/${randomUUID()}.${safeExt}`;
  const absolute = resolveStoredPath(storagePath);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);

  const checksum = createHash("sha256").update(buffer).digest("hex");

  const [row] = await db
    .insert(files)
    .values({
      userId,
      filename: original.slice(0, 255),
      mimeType: declaredMime,
      sizeBytes: buffer.byteLength,
      storagePath,
      checksum,
      purpose: purpose.slice(0, 200),
      dataType: "U",
    })
    .returning();

  await writeAudit(db, {
    userId,
    action: "create",
    entityType: "file",
    entityId: row.id,
    permissionLevel: "L2",
    detail: { filename: row.filename, sizeBytes: row.sizeBytes, mimeType: row.mimeType, checksum },
  });

  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    storagePath: row.storagePath,
    purpose: row.purpose,
    createdAt: row.createdAt,
  };
}

export async function listFiles(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt))
    .limit(200);
}

export async function getFileRecord(userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)))
    .limit(1);
  if (!row) {
    throw new AppError("FILE_NOT_FOUND", "文件不存在或不属于当前用户", 404);
  }
  return row;
}

/** 读取文件内容用于下载；磁盘缺失时给出明确提示，不返回空文件冒充成功 */
export async function readFileContent(userId: string, id: string) {
  const record = await getFileRecord(userId, id);
  const absolute = resolveStoredPath(record.storagePath);
  try {
    await stat(absolute);
  } catch {
    throw new AppError(
      "FILE_MISSING_ON_DISK",
      "数据库有该文件的记录，但磁盘上找不到原件。可能已被手动删除或未随备份恢复。",
      410,
    );
  }
  const buffer = await readFile(absolute);
  return { record, buffer };
}

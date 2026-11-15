import { getEnv } from "@/lib/config/env";
import { AppError, fail, ok } from "@/lib/errors/api";
import { listFiles, saveUpload } from "@/server/services/files";

export const dynamic = "force-dynamic";

/** GET /api/v1/files — 文件列表（仅当前用户） */
export async function GET() {
  try {
    return ok(await listFiles(getEnv().APP_USER_ID));
  } catch (error) {
    return fail(error);
  }
}

/**
 * POST /api/v1/files — 上传文件（文档 6）
 * multipart/form-data：file（必填）、purpose（可选）
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError(
        "INVALID_CONTENT_TYPE",
        "请用 multipart/form-data 上传文件，字段名为 file",
        415,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("INVALID_FORM_DATA", "表单数据解析失败，请确认文件未损坏", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("FILE_REQUIRED", "没有收到文件，请选择文件后重试", 422);
    }

    const purpose = String(form.get("purpose") ?? "").slice(0, 200);
    const result = await saveUpload(getEnv().APP_USER_ID, file, purpose);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}

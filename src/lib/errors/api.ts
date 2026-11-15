import type { z } from "zod";

/** 统一应用错误：code 可机读，message 面向用户，不泄漏堆栈与密钥 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

/** 统一错误响应：未知异常只回泛化信息，详情写服务端日志 */
export function fail(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status },
    );
  }
  console.error("[api] 未处理异常:", error);
  return Response.json(
    { ok: false, error: { code: "INTERNAL_ERROR", message: "服务内部错误，请查看服务端日志", details: null } },
    { status: 500 },
  );
}

/** Zod 校验入口：失败统一抛 422，附带字段级错误 */
export function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    throw new AppError("VALIDATION_FAILED", "输入校验未通过", 422, { fields });
  }
  return parsed.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }
}

/** 允许空 body 的接口：无 body 视为 {}，有 body 但格式错误仍报 400 */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }
}

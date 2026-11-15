import { z } from "zod";

/**
 * 环境变量契约：只在这里读取 process.env。
 * 任何真实密钥只允许出现在 .env.local（已被 .gitignore 排除）。
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_USER_ID: z.string().min(1).default("00000000-0000-0000-0000-000000000001"),
  AI_PROVIDER: z.enum(["none", "mock", "openai-compatible"]).default("none"),
  APP_ENV: z.enum(["local", "test", "production"]).default("local"),
  /** 上传根目录，相对项目根；测试时指到临时目录，避免污染真实文件 */
  UPLOAD_DIR: z.string().min(1).default("storage/uploads"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`[env] 环境变量校验失败：${detail}`);
  }
  cached = parsed.data;
  return cached;
}

/** 测试用：允许重置缓存 */
export function resetEnvCache(): void {
  cached = null;
}

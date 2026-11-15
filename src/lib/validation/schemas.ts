import { z } from "zod";

/** 文档 4.3：所有重要研究数据必须支持 R/E/P/S/U */
export const DATA_TYPES = ["R", "E", "P", "S", "U"] as const;
export const dataTypeSchema = z.enum(DATA_TYPES);
export type DataType = (typeof DATA_TYPES)[number];

export const PROJECT_STATUSES = ["planning", "active", "paused", "completed", "archived"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const TASK_STATUSES = ["pending", "running", "blocked", "review", "done", "cancelled"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const PERMISSION_LEVELS = ["L1", "L2", "L3", "L4"] as const;
export const permissionLevelSchema = z.enum(PERMISSION_LEVELS);

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "项目名称至少 2 个字符").max(120, "项目名称最多 120 个字符"),
  description: z.string().trim().max(2000, "描述最多 2000 个字符").optional().default(""),
  status: projectStatusSchema.optional().default("planning"),
  dataType: dataTypeSchema.optional().default("U"),
});

export const patchProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: projectStatusSchema.optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "没有可更新的字段" });

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, "任务标题至少 2 个字符").max(200, "任务标题最多 200 个字符"),
  detail: z.string().trim().max(2000, "验收标准最多 2000 个字符").optional(),
  projectId: z.string().min(1).nullable().optional(),
  priority: z.number().min(1).max(5).optional().default(2),
  source: z.enum(["user", "assistant", "workflow"]).optional().default("user"),
  dataType: dataTypeSchema.optional().default("U"),
});

export const createApprovalSchema = z.object({
  entityType: z.string().trim().min(1).max(60),
  entityId: z.string().trim().min(1).max(120),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional().default(""),
});

/** 执行请求：可指定 Agent，缺省用任务上已分配的 Agent */
export const runTaskSchema = z.object({
  agentSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/, "Agent 标识只允许小写字母、数字与连字符")
    .optional(),
});

/** 文件上传的表单字段（文件本体单独从 FormData 取，不进 Zod） */
export const uploadFileSchema = z.object({
  purpose: z.string().trim().max(200, "用途说明最多 200 个字符").optional().default(""),
});

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 允许上传的类型白名单：扩展名 → 允许的 MIME（双重校验，防伪装） */
export const UPLOAD_WHITELIST: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  csv: ["text/csv", "application/csv", "text/plain"],
  md: ["text/markdown", "text/plain"],
  txt: ["text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  zip: ["application/zip", "application/x-zip-compressed"],
};

/** Agent 直接执行：给 taskId 就执行该任务，只给 target 就先建任务再执行 */
export const runAgentSchema = z
  .object({
    taskId: z.string().uuid("taskId 必须是合法 UUID").optional(),
    target: z.string().trim().min(2, "目标至少 2 个字符").max(500, "目标最多 500 个字符").optional(),
  })
  .refine((v) => Boolean(v.taskId || v.target), {
    message: "必须提供 taskId 或 target 其中之一",
  });

export type RunAgentInput = z.infer<typeof runAgentSchema>;

/** 启动工作流：goal 是研究目标，inputs 按节点 id 提供人工节点的内容 */
export const startWorkflowSchema = z.object({
  goal: z.string().trim().max(500, "目标最多 500 个字符").optional().default(""),
  projectId: z.string().uuid("projectId 必须是合法 UUID").optional(),
  inputs: z.record(z.string(), z.string().trim().max(2000, "单条输入最多 2000 个字符")).optional(),
});

/** 人工决策：approve 才会继续推进，reject 直接终止本次运行 */
export const decideWorkflowSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2000, "备注最多 2000 个字符").optional().default(""),
});

/** 续跑：retry 重试失败节点，skip 跳过它继续。跳过必须写原因（服务端另校验长度） */
export const resumeWorkflowSchema = z.object({
  action: z.enum(["retry", "skip"]),
  note: z.string().trim().max(2000, "备注最多 2000 个字符").optional().default(""),
});

export type StartWorkflowInput = z.infer<typeof startWorkflowSchema>;
export type DecideWorkflowInput = z.infer<typeof decideWorkflowSchema>;
export type ResumeWorkflowInput = z.infer<typeof resumeWorkflowSchema>;

export type RunTaskInput = z.infer<typeof runTaskSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

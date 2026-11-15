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

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

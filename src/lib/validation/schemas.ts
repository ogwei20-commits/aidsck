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

/** 项目里程碑：日期只到天，格式严格校验，避免 new Date 把 2026-13-45 吞成 Invalid Date */
export const createMilestoneSchema = z.object({
  projectId: z.string().uuid("projectId 必须是合法 UUID"),
  title: z.string().trim().min(2, "里程碑至少 2 个字符").max(160, "里程碑最多 160 个字符"),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "截止日期格式应为 YYYY-MM-DD")
    .nullish(),
});

export const patchMilestoneSchema = z
  .object({
    done: z.boolean().optional(),
    title: z.string().trim().min(2, "里程碑至少 2 个字符").max(160, "里程碑最多 160 个字符").optional(),
  })
  .refine((v) => v.done !== undefined || v.title !== undefined, {
    message: "至少提供 done 或 title 中的一项",
  });

export type StartWorkflowInput = z.infer<typeof startWorkflowSchema>;
export type DecideWorkflowInput = z.infer<typeof decideWorkflowSchema>;

/* ────────────────────────────────────────────────────────────
 * 证据关联（citations）
 *
 * 来源链接只接受 http/https。报告会被导出成 .md 与可打印 HTML，
 * 如果把 javascript: / data: 存进来，导出文件在别人机器上打开就成了注入面。
 * 允许为空——线下访谈、内部数据这类来源没有链接，但仍应登记标题与出处。
 * ──────────────────────────────────────────────────────────── */
export const citationUrlSchema = z
  .string()
  .trim()
  .max(2000, "链接最多 2000 个字符")
  .refine(
    (v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v),
    "链接必须以 http:// 或 https:// 开头",
  );

export const createCitationSchema = z.object({
  reportId: z.string().uuid("reportId 必须是合法 UUID"),
  sourceTitle: z.string().trim().min(2, "来源名称至少 2 个字符").max(200, "来源名称最多 200 个字符"),
  sourceUrl: citationUrlSchema.optional().default(""),
  quote: z.string().trim().max(2000, "引文最多 2000 个字符").optional().default(""),
  dataType: dataTypeSchema.optional().default("U"),
});

/* ────────────────────────────────────────────────────────────
 * 财务计算接口
 *
 * 页面上的输入框允许留空（按 0 处理），接口也一样：缺省字段按 0，
 * 但费率必须落在 0–100，售价必须 ≥ 0——否则算出来的净利没有意义。
 * 数值上限拦的是「手滑多打几个 0」，不是业务限制。
 * ──────────────────────────────────────────────────────────── */
const moneyField = (label: string) =>
  z.number().finite(`${label}必须是数字`).min(0, `${label}不能为负数`).max(1_000_000_000, `${label}超出可计算范围`).optional().default(0);
const rateField = (label: string) =>
  z.number().finite(`${label}必须是数字`).min(0, `${label}不能为负数`).max(100, `${label}不能超过 100%`).optional().default(0);

export const calculateFinanceSchema = z.object({
  name: z.string().trim().max(120, "方案名称最多 120 个字符").optional().default(""),
  currency: z.string().trim().min(1).max(8).optional().default("USD"),
  /** 成本币种；留空 = 与售价币种相同。填了就按汇率把成本折算到售价币种 */
  costCurrency: z.string().trim().max(8).optional().default(""),
  /** 折算汇率；不传则按库里当前有效汇率解析，解析不到就明确报缺 */
  fxRate: z.number().finite("汇率必须是数字").positive("汇率必须大于 0").max(1_000_000).optional(),
  sellPrice: z.number().finite("售价必须是数字").min(0, "售价不能为负数").max(1_000_000_000).optional().default(0),
  purchaseCost: moneyField("采购成本"),
  shippingCost: moneyField("运费"),
  commissionRate: rateField("平台佣金率"),
  paymentRate: rateField("支付费率"),
  adCost: moneyField("单件广告费"),
  otherCost: moneyField("其他单件成本"),
  fixedCost: moneyField("固定投入"),
  expectedOrders: z.number().int("预计单量必须是整数").min(0).max(100_000_000).optional().default(0),
  /** 自定义档位；不传则按基准价自动生成五档 */
  prices: z.array(z.number().finite().positive("档位价格必须大于 0")).min(1).max(9).optional(),
});

export type CalculateFinanceInput = z.infer<typeof calculateFinanceSchema>;

/* ────────────────────────────────────────────────────────────
 * 汇率
 *
 * 只收三位字母代码并统一大写：CNY 与 cny 是同一个币种，
 * 存成两种写法会让「查当前汇率」永远查不到其中一种。
 * ──────────────────────────────────────────────────────────── */
export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "币种须为三位字母代码，如 USD")
  .transform((v) => v.toUpperCase());

export const createRateSchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    rate: z.number().finite("汇率必须是数字").positive("汇率必须大于 0").max(1_000_000, "汇率超出合理范围"),
    /** YYYY-MM-DD 或完整 ISO；不传按当前时间 */
    effectiveAt: z.string().trim().max(40).optional().default(""),
    source: z.string().trim().max(80).optional().default("manual"),
    dataType: z.enum(["R", "E", "P", "S", "U"]).optional().default("U"),
  })
  .refine((v) => v.baseCurrency !== v.quoteCurrency, {
    message: "基准币种与报价币种不能相同",
    path: ["quoteCurrency"],
  })
  .refine((v) => v.effectiveAt === "" || !Number.isNaN(Date.parse(v.effectiveAt)), {
    message: "生效时间格式不正确，请用 YYYY-MM-DD",
    path: ["effectiveAt"],
  });

export const fetchRatesSchema = z.object({
  base: currencyCodeSchema.default("USD"),
  /** 只接受一批白名单币种，避免一次写入上百条无关汇率 */
  targets: z.array(currencyCodeSchema).min(1).max(30).optional(),
});

export type CreateRateInput = z.infer<typeof createRateSchema>;
export type FetchRatesInput = z.infer<typeof fetchRatesSchema>;

export type ResumeWorkflowInput = z.infer<typeof resumeWorkflowSchema>;

export type RunTaskInput = z.infer<typeof runTaskSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
export type CreateCitationInput = z.infer<typeof createCitationSchema>;

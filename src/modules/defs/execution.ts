import type { ModuleDef, SelectOption } from "../types";

const projectStatus: SelectOption[] = [
  { value: "planning", label: "规划中", tone: "muted" },
  { value: "active", label: "进行中", tone: "accent" },
  { value: "paused", label: "已暂停", tone: "warn" },
  { value: "completed", label: "已完成", tone: "ok" },
  { value: "archived", label: "已归档", tone: "muted" },
];

const taskStatus: SelectOption[] = [
  { value: "pending", label: "待处理", tone: "warn" },
  { value: "running", label: "执行中", tone: "accent" },
  { value: "blocked", label: "受阻", tone: "danger" },
  { value: "review", label: "待审核", tone: "warn" },
  { value: "done", label: "已完成", tone: "ok" },
  { value: "cancelled", label: "已取消", tone: "muted" },
];

const permissionLevel: SelectOption[] = [
  { value: "L1", label: "L1 只读分析", tone: "muted" },
  { value: "L2", label: "L2 生成草稿", tone: "accent" },
  { value: "L3", label: "L3 经批准执行", tone: "warn" },
  { value: "L4", label: "L4 禁止自主", tone: "danger" },
];

const priorityOptions: SelectOption[] = [
  { value: "1", label: "高" },
  { value: "2", label: "中" },
  { value: "3", label: "低" },
];

/** 文档 1.1「执行」组：项目、任务、Agent、工作流 */
export const EXECUTION_MODULES: ModuleDef[] = [
  {
    slug: "projects",
    label: "项目中心",
    group: "执行",
    table: "projects",
    titleField: "name",
    subtitleField: "goal",
    statusField: "status",
    statusOptions: projectStatus,
    purpose: "一个项目对应一次跨境尝试（一个店、一个品类、一个市场），任务与研究都挂在它下面。",
    createLabel: "新建项目",
    emptyHint: "先建一个项目，比如「北美宠物用品店 · 可行性验证」，后续任务和研究都会挂到它下面。",
    fields: [
      { name: "name", label: "项目名称", kind: "text", required: true, placeholder: "北美宠物用品店 · 可行性验证" },
      { name: "goal", label: "目标", kind: "text", placeholder: "3 个月内跑通首个盈利单品" },
      { name: "description", label: "说明", kind: "textarea", placeholder: "想验证什么、边界在哪" },
      { name: "status", label: "状态", kind: "select", options: projectStatus, default: "planning" },
      { name: "progress", label: "进度 %", kind: "int", default: "0" },
    ],
    columns: [
      { name: "name", label: "项目" },
      { name: "status", label: "状态", kind: "badge", options: projectStatus },
      { name: "progress", label: "进度", kind: "progress" },
      { name: "updatedAt", label: "更新", kind: "mono" },
    ],
  },
  {
    slug: "tasks",
    label: "任务中心",
    group: "执行",
    table: "tasks",
    titleField: "title",
    subtitleField: "detail",
    statusField: "status",
    statusOptions: taskStatus,
    purpose: "每件事落到一条任务上，才有状态、有执行记录、有负责人（Agent）。",
    createLabel: "新建任务",
    emptyHint: "还没有任务。写下第一件具体要做的事，比如「调研美国宠物食品进口合规要求」。",
    fields: [
      { name: "title", label: "任务标题", kind: "text", required: true, placeholder: "调研美国宠物食品进口合规要求" },
      { name: "projectId", label: "所属项目", kind: "ref", refTable: "projects", refLabel: "name" },
      { name: "detail", label: "说明", kind: "textarea", placeholder: "验收标准是什么" },
      { name: "status", label: "状态", kind: "select", options: taskStatus, default: "pending" },
      { name: "priority", label: "优先级", kind: "select", options: priorityOptions, default: "2" },
    ],
    columns: [
      { name: "title", label: "任务" },
      { name: "status", label: "状态", kind: "badge", options: taskStatus },
      { name: "priority", label: "优先级", kind: "badge", options: priorityOptions },
      { name: "updatedAt", label: "更新", kind: "mono" },
    ],
  },
  {
    slug: "agents",
    label: "Agent 中心",
    group: "执行",
    table: "agents",
    scope: "shared",
    titleField: "name",
    subtitleField: "role",
    statusField: "status",
    statusOptions: [
      { value: "ready", label: "就绪", tone: "ok" },
      { value: "paused", label: "已停用", tone: "muted" },
    ],
    purpose: "Agent 是业务角色，不是服务器。这里管它们能做什么、能用哪些工具、权限到几级。",
    createLabel: "注册 Agent",
    emptyHint: "内置的 6 个 Agent 会在执行 seed 后出现；也可以手动注册一个自定义角色。",
    fields: [
      { name: "name", label: "名称", kind: "text", required: true, placeholder: "选品研究员" },
      { name: "slug", label: "标识", kind: "text", required: true, placeholder: "product-researcher" },
      { name: "role", label: "职责", kind: "text", required: true, placeholder: "产品与竞品研究" },
      { name: "description", label: "说明", kind: "textarea" },
      { name: "permissionLevel", label: "权限等级", kind: "select", options: permissionLevel, default: "L1" },
      { name: "status", label: "状态", kind: "select", options: [{ value: "ready", label: "就绪" }, { value: "paused", label: "已停用" }], default: "ready" },
    ],
    columns: [
      { name: "name", label: "Agent" },
      { name: "role", label: "职责" },
      { name: "permissionLevel", label: "权限", kind: "badge", options: permissionLevel },
      { name: "status", label: "状态", kind: "badge", options: [{ value: "ready", label: "就绪", tone: "ok" }, { value: "paused", label: "已停用", tone: "muted" }] },
    ],
  },
  {
    slug: "workflows",
    label: "工作流中心",
    group: "执行",
    table: "workflows",
    scope: "shared",
    titleField: "name",
    subtitleField: "description",
    purpose: "把「研究 → 分析 → 审核 → 交付」固化成可重跑的步骤，而不是每次凭记忆走一遍。",
    createLabel: "新建工作流",
    emptyHint: "先建一条工作流，比如「选品可行性验证」，把步骤写清楚，之后每次换品类都能重跑。",
    fields: [
      { name: "name", label: "工作流名称", kind: "text", required: true, placeholder: "选品可行性验证" },
      { name: "slug", label: "标识", kind: "text", required: true, placeholder: "product-feasibility" },
      { name: "description", label: "说明", kind: "textarea", placeholder: "包含哪几个节点，谁在什么条件下推进" },
    ],
    columns: [
      { name: "name", label: "工作流" },
      { name: "description", label: "说明" },
      { name: "updatedAt", label: "更新", kind: "mono" },
    ],
  },
];

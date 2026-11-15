# 02 · 架构设计

> 来源：文档第 2 节。技术栈已由「建议」转为**实际锚定版本**（见下表）。

## 1. 形态：模块化单体

各业务模块逻辑独立，第一阶段部署在同一个 Next.js 应用中。**不把每个 Agent 拆成微服务** ——
Agent 是业务角色，不代表独立服务器。

```
浏览器
  ↓
Web 前端（App Router / RSC + 少量 Client Component）
  ↓
Route Handlers /api/v1/*  ← Zod 校验 + 统一错误响应 + 权限检查 + 审计
  ↓
服务层 services/*  →  permissions/*  →  audit/*
  ↓
Drizzle ORM → PostgreSQL 16（本机） / 本地文件存储（后续）
  ↓
AI 协调层
  ├─ Provider（none / mock / openai-compatible）
  ├─ Agent Registry（6 个角色 + 权限 + 上限）
  ├─ Orchestrator
  │    ├─ planner     目标 → 步骤（规则模板）
  │    ├─ dispatcher  步骤 → 逐条派发（失败隔离）
  │    └─ executor    单任务执行 → 产出 / 质量检查 / 落库
  └─ Workflows
       ├─ definitions  3 条内置流程 / 9 种节点
       ├─ engine       状态机与原子占位
       ├─ step-runner  节点真实行为
       └─ resume       失败重试 / 跳过
```

## 2. 技术栈（实际安装版本，已写入 package-lock.json）

| 层 | 技术 | 锁定版本 | 说明 |
|---|---|---|---|
| 前端 + 后端 | Next.js | 16.4.6 | App Router，Route Handlers |
| 语言 | TypeScript | 5.x | strict: true |
| UI | React / Tailwind CSS | 19.3.0 / 4.3.3 | 无 shadcn/ui（Sprint 1 不引入额外复杂度） |
| 数据库 | PostgreSQL | 16.15 | 本机安装，不用 Docker |
| ORM | Drizzle ORM / drizzle-kit | 0.45.4 / 0.31.11 | 迁移文件纳入 Git |
| 校验 | Zod | 4.6.7 | 所有 API 输入 |
| 测试 | Vitest | 5.1.0 | 单元 + 集成 |
| 脚本 | tsx | 4.23.15 | 数据库脚本 |

**版本锚定记录**：脚手架生成 Next 16.4.6，其 `AGENTS.md` 明确警告与旧版 API 有破坏性变更。
开发前已读 `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` 与 route 约定，
据此采用异步 `params`、原生 `Response.json`、`eslint` CLI（不用已移除的 `next lint`）。

## 3. 分层依赖方向

```
app/(页面、路由) → components → server/services → db
                          ↘ lib/(config,validation,errors,utils)
                          ↘ types
```

下层不得 import 上层。`src/modules/` 是「数据形状 + 表单字段 + 列表列」的注册表（19 个模块定义），
通用页面与 CRUD 内核由它驱动，新增模块只需加一份定义。

## 4. 关键架构决定（代劳表）

| 决定 | 选择 | 理由 | 改的代价 |
|---|---|---|---|
| 构建器 | Turbopack（Next 16 默认） | 官方默认，无需额外配置 | 低 |
| 字体 | 系统字体栈（中文优先） | 移除 `next/font/google`，避免构建期联网 | 低 |
| 图标 | 内联 SVG 图标库 | 禁 emoji，零 CDN 依赖 | 低 |
| 数据库连接 | 懒连接 `getDb()` | build 阶段不连库，未配置时明确提示 | 低 |
| 首页渲染 | `force-dynamic` | 数据实时来自数据库，不预渲染假数据 | 低 |
| AI 接入 | 仅接口 + 未配置提示 + mock | 未经批准不得接付费 API | 低 |
| 审批 | 复用 `audit_logs` 记录 | 不提前建完整审批流 | 中（需迁到 `approvals` 表） |
| 调度方式 | 同步执行（单批 ≤6 条） | 框架/模拟模式毫秒级，无需队列 | 中（接真模型必须改后台队列） |
| 图表 | 纯 SVG 手绘 | 只两种图（保本线、进度条），引图表库不划算 | 低 |
| 文件解析 | pdfjs-dist + mammoth（纯 JS） | 中文 PDF 需 cMap；`serverExternalPackages` 让它们按 Node 原生加载，保留包内字典目录 | 中 |
| 全文检索 | PostgreSQL `ILIKE` | 中文子串匹配天然正确，不装 zhparser / pg_bigm；单机规模（几千块）足够 | 低 |
| 汇率源 | 两个免费无 key 公开源 | 主源覆盖 TWD/VND 等 ECB 不发布的币种，备源兜底；断网可手录 | 低 |
| 来源归属 | 挂报告，不挂任意结论 | 报告是唯一有稳定引用位置与导出位置的实体 | 低 |
| 错误提示 | 服务层翻译成人话 | 页面上不出现 SQL 与堆栈，原始错误进日志 | 低 |

## 5. 后续扩展点

- 任务队列：工作流定时/触发运行、总管家异步派发，都依赖它
- 向量 / 语义检索：ILIKE 全文检索已可用，未接 embedding 与相似度排序
- 汇率换算：`currency_rates` 表已建，未接页面
- 认证与多用户：`user_id` 已在所有业务表，缺的是身份校验
- 云端托管数据库、对象存储：本地文件存储之上再评估

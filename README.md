# CrossBorder AI Workspace

跨境电商 AI 智能体工作台 · 第一阶段（本地运行）

19 个模块全部可增删改查，数据写入本机 PostgreSQL。没有一条是写死的假数据，也没用静态页面冒充功能。

---

## 1. 先看它能干什么

打开首页，首屏是一句话输入框。你写「想在美国卖宠物冻干零食，预算 5 万」，系统按跨境电商的研究流程拆成任务，直接落到任务中心：

| 拆出来的任务 | 谁来干 | 权限 |
|---|---|---|
| 市场研究：规模、需求与竞争格局 | Market Analyst | L1 |
| 平台比较：佣金、门槛与品类适配度 | Platform Analyst | L1 |
| 选品研究：候选产品与竞品拆解 | Product Researcher | L1 |
| 财务模拟：单件成本、利润与盈亏平衡 | Finance Analyst | L2 |
| 合规核查：准入资质与税务要求 | 人工执行（暂无该角色） | — |

拆解来自**内置流程模板**，不是模型推理。每一条结果都会写明这一点——接入真实模型前，系统不会声称任何输出是 AI 生成的。

## 2. 19 个模块

| 分组 | 模块 | 能做什么 |
|---|---|---|
| 总览 | 综合首页 | 一句话拆任务、生意数字、双轨（做/学）、Agent 状态、沉淀、边界 |
| 总览 | AI 总管家 | 目标拆解、挂项目、拆解留痕 |
| 执行 | 项目中心 | 项目增删改、状态流转、进度 |
| 执行 | 任务中心 | 任务增删改、优先级、关联项目与 Agent |
| 执行 | Agent 中心 | 角色注册、权限等级、工具白名单 |
| 执行 | 工作流中心 | 流程定义与说明 |
| 研究 | 市场研究 | 问题 → 资料 → 结论，状态流转 |
| 研究 | 平台比较 | 平台档案、佣金、门槛、适配评分 |
| 研究 | 选品研究 | 产品档案、进价售价、竞争强度 |
| 研究 | 供应链研究 | 供应商、起订量、单价、交期 |
| 研究 | 财务模拟 | 输入成本售价 → 自动算单件成本/净利/利润率/盈亏平衡 |
| 沉淀 | 学习中心 | 学习计划、周投入、进度 |
| 沉淀 | 成长档案 | 能力等级、目标等级、下一步 |
| 沉淀 | 知识库 | 结论、规则、踩过的坑，可分类打标 |
| 沉淀 | 文件中心 | 文件元数据与路径登记（**不支持上传**，见第 6 节） |
| 沉淀 | 报告中心 | 草稿 → 待审 → 定稿 |
| 沉淀 | 数据溯源 | 各表数据量、数据类型标准、变更留痕 |
| 沉淀 | 安全中心 | 审批登记、L3 操作闸门 |
| 沉淀 | 系统设置 | 运行参数 |

## 3. 快速开始（Windows 16GB 本地）

### 3.1 装依赖

| 软件 | 版本 | 说明 |
|---|---|---|
| Node.js | 22.x LTS | [nodejs.org](https://nodejs.org) 下载 LTS，安装时勾选 Add to PATH |
| PostgreSQL | 16.x | [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)，安装时记住 postgres 密码 |
| Git | 最新 | [git-scm.com](https://git-scm.com) |

### 3.2 建库

用 pgAdmin 或命令行：

```sql
CREATE ROLE cbai LOGIN PASSWORD '改成一个你自己的密码';
CREATE DATABASE crossborder_ai OWNER cbai;
```

### 3.3 跑起来

```powershell
cd crossborder-ai-workspace
npm ci
copy .env.example .env.local
# 编辑 .env.local，把 DATABASE_URL 改成你的密码
npm run db:migrate
npm run db:seed
npm run dev
```

打开 http://localhost:3000 。

### 3.4 想先看点内容

```powershell
npm run db:demo        # 写入一组「[演示]」开头的数据
npm run db:demo:clear  # 一键清除，不留残留
```

演示数据全部标 `[演示]` 前缀，`data_type = U`（用户输入），平台费率标 `E`（估算）——不冒充真实采集数据。

## 4. 三套配色

顶栏右侧可切换，选择写进 cookie，刷新不丢。

| 方案 | 适用 |
|---|---|
| 深色专业 | 信息密度高，长时间盯着不累，AI 工具感最强 |
| 浅色琥珀 | 贸易、物流、钱的味道 |
| 浅色靛蓝 | 稳重企业感，报告与数据为主 |

改配色只改 `src/app/globals.css` 里 `[data-theme="..."]` 下的变量，组件不写死颜色。

## 5. 架构

```
src/
├── app/
│   ├── page.tsx                 # 首页：对话 → 结果 → 沉淀 三段式
│   ├── [section]/page.tsx       # 通用模块页（19 个模块共用一套）
│   └── api/v1/
│       ├── modules/[module]/        # 通用 CRUD（15 个模块共用）
│       ├── assistant/plan/          # 目标拆解
│       ├── projects|tasks|approvals # 专项端点
│       └── health|agents|audit-logs
├── modules/
│   ├── types.ts                 # 模块定义的类型
│   ├── defs/                    # 19 份模块定义（字段、列、空态文案）
│   ├── registry.ts              # 汇总 + 表名白名单
│   └── store.ts                 # 通用数据内核（参数化查询）
├── db/
│   ├── schema/                  # 7 个域文件，39 张表
│   └── migrations/              # 3 个迁移，全部纳入 Git
├── server/
│   ├── ai/{providers,orchestrator,agents,tools}
│   ├── services/                # 汇总查询、财务计算
│   ├── permissions/             # L1–L4 + 审批闸门
│   └── audit/                   # 审计日志
└── components/                  # 布局、首页、模块通用组件
```

**为什么用「一个内核 + 19 份定义」**：19 个模块手写 19 套 CRUD，必然一半是半成品。现在新增一个模块只需要在 `defs/` 里写一份定义，页面与 API 自动可用。

**安全边界**：表名和列名只来自注册表白名单，任何外部字符串都不进入 SQL 标识符位置；值一律参数绑定。

## 6. 现在做不到什么（写清楚，不装）

| 限制 | 现状 | 什么时候补 |
|---|---|---|
| AI 真实推理 | `AI_PROVIDER=none`，不调任何模型、不产生费用 | 接入前需要你批准，并明确预算 |
| 登录认证 | 无认证，只在本机用 | 暴露公网前必须补齐 |
| 文件上传 | 只登记元数据与路径，不接收文件 | Sprint 3 |
| 店铺/订单/库存同步 | 未实现 | 第二阶段 |
| 自动发布/投放/客服/退款 | 未实现 | 第二阶段 |
| 多租户与插件市场 | 未实现 | 第二阶段 |
| 向量检索 | 建了 `file_chunks` 表，未接检索 | 后续 |

## 7. 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务 |
| `npm run build` / `npm start` | 生产构建与运行 |
| `npm run typecheck` | 类型检查 |
| `npm run lint` | ESLint |
| `npm test` | Vitest（35 个用例） |
| `npm run db:generate` | 改完 schema 生成迁移 |
| `npm run db:migrate` | 应用迁移 |
| `npm run db:check` | 连通与表结构自检 |
| `npm run db:seed` | 内置 Agent 定义（幂等） |
| `npm run db:demo` / `npm run db:demo:clear` | 演示数据写入 / 清除 |
| `npm run db:backup` / `npm run db:restore` | 备份 / 恢复 |

## 8. 数据规则

- 金额一律 `numeric(18,4)`，不用浮点（`src/db/schema/shared.ts`）
- 汇率 `numeric(18,8)`，保留历史不覆盖
- 每条业务数据带 `data_type`：R 真实 / E 估算 / P 预测 / S 模拟 / U 用户输入
- 表结构变更只能通过迁移文件，迁移必须进 Git
- 删除是 L3 操作：需要安全中心里的 approved 记录，否则 403
- 所有创建、修改、审批、拆解都写 `audit_logs`

## 9. 技术栈（已锁定版本）

Next.js 16.4.6 · React 19.3.0 · TypeScript 5 · Tailwind CSS 4.3.3 · Drizzle ORM 0.44 · postgres.js 3.4 · Zod 4 · Vitest 5.1

`package-lock.json` 已提交，`npm ci` 可复现。

---

第一阶段目标：先跑通一条完整业务流程，再扩展。当前状态见 `PROJECT_STATE.md`。

# 10 · 开发路线图

> 来源：文档第 10 节 Sprint 0–7。状态以实际产物路径为准，不写「做完了」这种模糊表述。
> 更新：2026-11-15 · 第十一阶段（功能补齐）

## 1. Sprint 状态

| Sprint | 交付内容 | 状态 | 产物路径 |
|---|---|---|---|
| S0 | 环境、Node、Git、PostgreSQL、仓库 | **已完成** | `README.md` 第 3 节；仓库 `ogwei20-commits/aidsck` |
| S1 | Next.js 工程、TS、UI 体系、布局、左侧导航、响应式首页 | **已完成** | `package.json`、`src/app/layout.tsx`、`src/app/page.tsx`、`src/components/layout/`、`src/app/globals.css` |
| S2 | PostgreSQL 连接、ORM、39 张表、3 个迁移、种子、备份恢复 | **已完成** | `src/db/`、`src/db/migrations/`、`scripts/seed.ts`、`scripts/backup.sh`、`scripts/restore.sh` |
| S3 | 项目管理、任务管理、操作日志、文件、首页汇总 | **已完成** | `src/server/services/workspace.ts`、`files.ts`、`/api/v1/projects`、`/api/v1/tasks`、`/api/v1/files` |
| S4 | AI Provider、总管家、Agent 注册与调度、执行记录、审批 | **已完成** | `src/server/ai/**`、`/api/v1/assistant/plan`、`/api/v1/agents/:id/run`、`/api/v1/agent-runs/:id`、`/api/v1/approvals` |
| S5 | 市场、平台、选品、供应链、财务、报告 | **已完成** | `src/modules/defs/*`、`src/lib/finance/calc.ts`、`/api/v1/finance/calculate`、`/api/v1/reports/:id/export` |
| S6 | 学习计划、能力评估、成长档案 | **已完成（CRUD）** | `src/modules/defs/learning.ts`、`growth.ts` |
| S7 | 单元/集成/API/浏览器/安全/备份测试与文档 | **已完成** | `tests/`（29 文件 265 例）、`docs/`、`docs/ACCEPTANCE-SPRINT-1.md` |
| S8 | 工作流引擎、中断续跑、人工闸门 | **已完成** | `src/server/ai/workflows/**`、`/api/v1/workflows`、`/api/v1/workflow-runs/*` |
| S9 | 需求补齐：总管家调度、证据关联、错误边界、局域网运行 | **已完成** | `src/server/ai/orchestrator/dispatcher.ts`、`src/server/services/citations.ts`、`src/app/error.tsx`、`scripts/lan-address.mjs` |

## 2. 阶段闸门（已通过）

| 闸门 | 检查项 | 结果 |
|---|---|---|
| 需求评审 → 产品设计 | 平台形态 / MVP 范围 / 技术栈结论一致 | 通过（本地 Web 工作台，Next.js + PostgreSQL） |
| 产品设计 → 开发 | PRD 完整、P0 范围明确、每项有验收标准 | 通过（PRD v2.1） |
| 开发 → 测试 | 技术方案与功能清单对齐 | 通过 |
| 测试 → 交付 | P0 缺陷 0、核心链路 100%、265 例全绿 | 通过 |
| 交付 → 使用 | 部署说明、局域网访问、回滚与备份 | 通过（无公网部署，本地生产模式） |

## 3. 下一步（按优先级）

| 优先级 | 事项 | 前置条件 | 说明 |
|---|---|---|---|
| 1 | CI（GitHub Actions） | 仓库已推送 | 让 265 项测试随提交自动跑 |
| 2 | 登录与多用户隔离 | — | 上公网前必须；本地局域网自用可暂缓 |
| 3 | 工作流定时/触发运行 | 任务队列 | 现在只能手动推进 |
| 4 | 向量 / 语义检索 | 全文检索已可用 | 需 embedding 与相似度排序时再评估 |
| 5 | 接入真实模型 | 预算与 Provider 明确 | 同时把同步调度改成后台队列 |

## 4. 明确不在路线图内

真实店铺管理、订单库存同步、自动发布、自动投放、真实客服、自动退款采购、
多租户、计费、插件市场、复杂商业仿真。理由见 `docs/01-PRD.md` 第 8 节。

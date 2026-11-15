# PROJECT_STATE · CrossBorder AI Workspace

> 更新时间：2026-11-15 · 维护者：交付总监（大湾区靓仔）
> 用途：下次会话开头先读本文件，再决定「继续 / 改方向」

## 当前阶段

Phase 1 / Sprint 1（前端第一版已完成，**停在人工审批闸门**，未进入 Sprint 2）

## 已完成（只写产物路径）

- 工程骨架与版本锁定：`package.json`, `package-lock.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`
- 分层目录：`src/{app,components,modules,server,db,lib,types}`, `storage/`, `tests/`, `docs/`, `scripts/`
- 综合首页与导航：`src/app/page.tsx`, `src/app/[section]/page.tsx`, `src/components/layout/`, `src/components/dashboard/`, `src/app/globals.css`
- 数据库与迁移：`src/db/schema/index.ts`, `src/db/migrations/0000_curvy_fenris.sql`, `src/db/migrations/meta/`
- API：`src/app/api/v1/{health,projects,tasks,audit-logs,approvals,agents}/`
- 服务与治理：`src/server/services/workspace.ts`, `src/server/permissions/policy.ts`, `src/server/audit/logger.ts`, `src/server/ai/`
- 测试：`tests/unit/*.test.ts`, `tests/integration/*.test.ts`
- 运维脚本：`scripts/{db-check,seed,backup.sh,restore.sh}`
- 文档：`README.md`, `docs/01..10`, `docs/ACCEPTANCE-SPRINT-1.md`

## 进行中

- 无（停在审批闸门，不并行推进后端/业务模块）

## 待决策（每条带推荐项）

| 决策 | 推荐项 | 为什么需用户拍板 |
|---|---|---|
| 前端首页方向 | 保留「掌控台式」首屏（输入框 + 真实大数字） | 后续所有页面长在这个界面上，方向错了要重做 |
| Sprint 2 优先补哪批表 | 先补 `files` + `research_*`，支撑文件中心与研究报告 | 表结构一旦定错，迁移代价高 |
| 是否现在启用外部 AI | **否**，继续 `none` / `mock` | 涉及费用，未经批准不得启用 |

## 下一步（≤3 条）

1. 用户确认前端第一版 → 才进入 Sprint 2 数据库表扩展
2. 生成第二批迁移文件并纳入 Git
3. 补齐项目/任务最小版交互与文件元数据

## 已知坑（同类任务开工前扫一眼）

- Next.js 16 的 `params` 是 Promise；`next lint` 已移除；Turbopack 默认。写码前读 `node_modules/next/dist/docs/`。
- `vitest@5` 要求 `@types/node ^22||>=24`，脚手架默认 `^20` 会 ERESOLVE；正确修法是升 `@types/node` 到 22，不要用 `--force`。
- `next/font/google` 会在构建期联网拉字体，已改为本地中文系统字体栈。
- 首页必须 `force-dynamic`，否则 build 阶段会尝试连未启动的数据库。

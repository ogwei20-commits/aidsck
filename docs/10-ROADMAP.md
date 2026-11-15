# 10 · 开发路线图

> 来源：文档第 10 节 Sprint 0–7。状态以实际产物路径为准，不写「做完了」这种模糊表述。

| Sprint | 交付内容 | 状态 | 产物路径 |
|---|---|---|---|
| S0 | Windows 环境 / Node / Git / VS Code / PostgreSQL / 私有仓库 | 部分 | `README.md` 第 2 节（安装指导已给；私有仓库由用户本人创建） |
| S1 | Next.js 工程、TS、UI 体系、全局布局、左侧导航、响应式首页、错误处理 | **已完成** | `package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/layout/`, `src/app/globals.css` |
| S2 | PostgreSQL 连接、ORM、表结构、迁移、种子、备份方案 | **部分完成** | `src/db/`, `src/db/migrations/0000_curvy_fenris.sql`, `scripts/backup.sh`, `scripts/restore.sh` |
| S3 | 项目管理、任务管理、操作日志、文件元数据、首页汇总 | **部分完成** | `src/server/services/workspace.ts`, `/api/v1/projects`, `/api/v1/tasks`, `/api/v1/audit-logs` |
| S4 | AI Provider、总管家、Agent 注册与调度、执行记录、审批中心 | **接口/定义已建，调度未启用** | `src/server/ai/`, `/api/v1/agents`, `/api/v1/approvals` |
| S5 | 市场研究、平台比较、选品、财务模拟、报告生成 | 未开始 | `src/modules/`（空骨架） |
| S6 | 学习计划、课程、训练、能力评估、成长档案 | 未开始 | `src/modules/learning/`（空骨架） |
| S7 | 单元/API/数据库/页面/E2E/安全/备份恢复测试、开发文档 | 部分 | `tests/`, `docs/`, `docs/ACCEPTANCE-SPRINT-1.md` |

## 当前闸门

**前端第一版已完成，停在人工审批点。** 按开发模式「AI 主导开发 + 人工审批 + 用户逐步学习」，
确认以下三件事后才进入 Sprint 2/3：

1. 整体方向对不对（工作台式首页 vs 期望的其他形态）
2. 有没有一眼别扭的地方（位置、字号、配色、文案）
3. 功能范围对不对（第一条任务是否确实只做了骨架）

## 下一步（≤3 条，需确认后执行）

1. 补齐文档 4.2 的第二批表（`task_logs`, `project_milestones`, `files`, `research_*`），生成迁移文件
2. 完善项目/任务的最小版交互（编辑、状态流转、批量操作）
3. 文件中心元数据管理与上传限制（类型/大小/不可信内容处理）

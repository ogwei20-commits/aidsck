# 验收报告 · Sprint 1（第一条开发任务）

> 项目：CrossBorder AI Workspace · Development Blueprint V1.0
> 日期：2026-11-15 · 范围：**只建立基础工程、综合首页、导航和数据库连接**
> 原则：不得伪造测试结果；不得把静态页面标成完整功能；不得把模拟 AI / 模拟数据标成真实。
> 结论：**Sprint 1 交付通过；第一阶段基础架构（F-01~F-16）尚未全部完成**，未通过项逐条列在下面。

---

## 1. 本次完成内容

- 官方脚手架生成 Next.js 16 工程，依赖**精确版本写死**并提交 `package-lock.json`
- 按文档 3 建立分层目录骨架（25 个 `.gitkeep` 占位，随 Sprint 填充）
- 综合首页：**所有数字、项目、任务、日志实时来自 PostgreSQL**，无写死假数组
- 左侧导航 19 个模块，逐项标注「已可用 / 最小版 / 规划中」；规划中模块只有诚实占位页
- 数据库：4 张表、5 个索引、4 个外键、3 个枚举，初始迁移文件纳入版本管理
- 最小真实数据链路：创建/修改项目、创建任务、自动写审计日志、首页汇总
- 权限与审批：L1–L4 策略、工具白名单、归档必须人工审批
- AI Provider 统一接口：`none`（默认）/ `mock`（强制标注）/ 外部模型拒绝启用
- 测试、备份恢复脚本、开发文档 10 份、真实浏览器三档截图

## 2. 新建 / 修改文件（主要清单）

| 类别 | 路径 |
|---|---|
| 配置 | `package.json`, `package-lock.json`, `next.config.ts`, `drizzle.config.ts`, `vitest.config.mts`, `tsconfig.json`, `.env.example`, `.gitignore` |
| 页面 | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/[section]/page.tsx`, `src/app/globals.css` |
| 组件 | `src/components/layout/{shell,sidebar}.tsx`, `src/components/dashboard/{quick-create,sections}.tsx`, `src/components/ui/icons.tsx` |
| API | `src/app/api/v1/{health,projects,projects/[id],tasks,audit-logs,approvals,agents}/route.ts` |
| 数据 | `src/db/index.ts`, `src/db/schema/index.ts`, `src/db/migrations/0000_curvy_fenris.sql`, `src/db/migrations/meta/*` |
| 服务 | `src/server/services/workspace.ts`, `src/server/permissions/policy.ts`, `src/server/audit/logger.ts`, `src/server/ai/**` |
| 库 | `src/lib/config/{env,navigation}.ts`, `src/lib/validation/schemas.ts`, `src/lib/errors/api.ts`, `src/lib/utils/format.ts`, `src/types/index.ts` |
| 脚本 | `scripts/{db-check.ts,seed.ts,backup.sh,restore.sh}` |
| 测试 | `tests/setup.ts`, `tests/unit/*.test.ts`, `tests/integration/*.test.ts` |
| 文档 | `README.md`, `docs/01..10-*.md`, `PROJECT_STATE.md`, 本报告 |
| 证据 | `.design/shot-{1440,834,375}.png`, `.design/viewport-*.png`, `.design/metrics.json`, `storage/backups/*.dump` |

**修改文件**（脚手架原有）：`package.json`, `next.config.ts`, `.gitignore`, `README.md`, `src/app/{layout,page,globals.css}`。

## 3. 数据库变化

- 新建库 `crossborder_ai`（PostgreSQL 16.15），账号 `cbai`，仅本地权限
- 应用迁移 `0000_curvy_fenris.sql`：`users` / `projects` / `tasks` / `audit_logs`
- 枚举：`data_type(R,E,P,S,U)` / `project_status` / `task_status` / `permission_level(L1–L4)`
- 种子数据：`[示例]` 前缀的 1 项目 / 2 任务 / 1 用户 / 1 日志，**明确标注为本地开发种子，非真实业务数据**
- 验收脚本另写入 `[验收]` 前缀的真实数据（未删除，作为链路证据）
- 备份 `storage/backups/crossborder_ai_20261115_111732.dump`（13K）

## 4. 已运行测试与真实结果

> 所有退出码取自命令本身（重定向到日志后取 `$?`），**不是管道 `tail` 的退出码**。

| 命令 | 真实退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | 通过 |
| `npm run lint` | 0 | 通过 |
| `npm test` | 0 | **4 文件 / 23 用例全部通过**（单元 15 + 集成 8） |
| `npm run build` | 0 | Next.js 16.4.6 Turbopack 编译成功，10 条路由，全部 ƒ 按需渲染 |
| `npm run db:check` | 0 | PASS：连接、4 表、行数 |
| 备份恢复演练 | 0 | 恢复到临时库后 1/2/1/1 行一致，临时库已清理 |

**端到端 API（curl，真实 HTTP 状态）**

```
GET  /api/v1/health          200  DB connected=true, 4 张表, AI 未配置
POST /api/v1/projects        201  创建项目
GET  /api/v1/projects        200  项目数 2
PATCH /projects/:id          200  进度 35 / 状态 active
PATCH 归档（无审批）         403  APPROVAL_REQUIRED（已阻止）
POST /api/v1/tasks           201  创建任务并关联项目
POST /api/v1/approvals       201  写入人工批准
PATCH 归档（有审批）         200  状态 archived
POST 非法项目名              422  VALIDATION_FAILED + 字段级错误
GET  /api/v1/agents          200  6 个 Agent，状态全部 planned，8 个工具
GET  /api/v1/audit-logs      200  6 条日志
GET  /                       200  首页，53 处「规划中」标记，无「数据库未连通」横幅
GET  /market                 200  明确「尚未开发」，列出第一阶段范围外能力
```

**修复记录（不隐瞒）**：首轮验证曾出现两处真实缺陷 ——
① 脚手架默认 `cacheComponents: true` 与 `force-dynamic` 冲突导致 build 失败 → 关闭 cacheComponents 与其依赖的 `partialPrefetching`；
② `expect(...).resolves` 漏 `await` 导致 1 例测试失败 → 改为 `await getProject()` 后复验 23/23 通过。

## 5. 浏览器实测（Playwright + Chromium，真渲染）

| 指标 | 1440 | 834 | 375 |
|---|---|---|---|
| 标题行数 | 1 | 1 | 1 |
| 标题字号 | 48px | 30px | 24px |
| 横向溢出 | 无 | 无 | 无 |
| 节数 / 无标题节 | 5 / 0 | 5 / 0 | 5 / 0 |
| 左沿 / 右沿位置数 | 1 / 1 | 1 / 1 | 1 / 1 |
| 强调色像素占比 | 0.56% | 0.70% | 5.90% |
| 侧栏占视口 | 17.2% | 100%（顶部横向） | 100%（顶部横向） |

目视检查（1440 / 375 整页截图）：标题无断行、无一侧大片空白、五节版式各不相同（满幅带 / 分栏 / 表格 / 提示条 / 列表 / 图示）、无灰块占位图、层级清晰。

**静态门禁**：`design_presence_check` 与 `layout_variety_check` 返回 `[SKIP]`（这两条只扫描 `.html`，不适用于 Next 项目）；
`visual_metrics_check` 为 **P0 0 处、6 处提示**。已按提示把状态点收敛到强调色，色相家族由 5 降到 4。
上表中 9 条「需浏览器实测」项已用 Playwright 补齐主要部分并落盘 `.design/metrics.json`。
375 视口强调色 5.9% 略高于 5% 建议值，原因是移动端主按钮全宽以保证可点击，桌面仅 0.56%，**已如实记录，未调阈值掩盖**。

## 6. F-01 ~ F-16 验收门槛逐条结论

| 编号 | 条件 | 结论 | 证据 |
|---|---|---|---|
| F-01 | 项目能够正常启动 | ✅ 通过 | `npm run dev` HTTP 200；`npm run build` 退出码 0 |
| F-02 | 首页正常显示 | ✅ 通过 | 三档真实截图 `.design/shot-*.png` |
| F-03 | 页面导航正常工作 | ✅ 通过 | 19 模块链接；`/market` 200 且明确「尚未开发」 |
| F-04 | PostgreSQL 正常连接 | ✅ 通过 | `db-check` PASS；health `connected=true` |
| F-05 | 数据能够保存和读取 | ✅ 通过 | 集成测试 6 例；curl 201/200 |
| F-06 | 项目能够创建和修改 | ✅ 通过 | POST 201 / PATCH 200（进度 35） |
| F-07 | 任务能够创建和追踪 | ✅ 通过 | POST 201 / GET 列表可见 |
| F-08 | Agent 能够注册和分配任务 | ⚠️ **未完成（部分）** | 6 个 Agent 注册定义与工具白名单已建；**调度器与任务分配未实现（S4）** |
| F-09 | AI Provider 能接入或明确提示未配置 | ✅ 通过 | `none` 明确提示；mock 强制标注；外部模型 403 拒绝 |
| F-10 | 任务执行记录能够保存 | ⚠️ **未完成（部分）** | 创建/修改/审批已写 `audit_logs`；**`agent_runs` 执行记录未建（S4）** |
| F-11 | 审批机制能阻止未授权操作 | ✅ 通过 | 无审批 403 → 批准后 200；2 个集成测试 |
| F-12 | 文件元数据能够保存 | ❌ **未完成** | `files` 表与上传接口未建（S3） |
| F-13 | 操作日志能够查询 | ✅ 通过 | `GET /api/v1/audit-logs` 200，6 条 |
| F-14 | 代码能够提交到私有仓库 | ⚠️ **未完成（部分）** | 本地 Git 仓库已首次提交；**远程私有仓库由用户本人创建**，本项目不擅自创建或公开 |
| F-15 | 数据库能够备份并恢复 | ✅ 通过 | 备份 → 恢复到临时库 → 行数一致 → 清理 |
| F-16 | 自动化测试能够运行 | ✅ 通过 | Vitest 23/23、typecheck 0、lint 0 |

**合计：通过 12 项 / 部分完成 3 项 / 未完成 1 项。**
按文档 11「没有通过的项目必须明确标记为未完成」：F-08、F-10、F-12、F-14 均不计为通过，
因此**不能宣称第一阶段基础架构已全部完成**，当前状态是「Sprint 1 基础骨架已交付并可运行」。

## 7. 尚未完成事项

Agent 调度与执行记录、完整审批中心、工作流引擎、市场/平台/选品/供应链/财务研究业务、
文件上传与元数据、报告生成导出、学习成长、数据溯源 UI、认证与多租户、E2E 自动化测试套件（S7）、
远程私有仓库（需用户创建）。

## 8. 已知风险与降级说明

1. **环境差异**：目标设备为 Windows 16GB，本次验证在 Linux 沙箱（Node 22.13.1 / PostgreSQL 16.15）完成。
   Windows 实机安装与运行**未验证**，步骤已写在 `README.md` 第 2 节，需用户在本机执行确认。
2. **无认证**：单人本地环境，任何能访问 localhost 的人都能读写数据，**禁止暴露公网**。
3. 审批记录复用 `audit_logs`，S4 需迁到独立 `approvals` 表（有迁移路径）。
4. 尚无 CSRF / 速率限制 / CSP / 文件上传限制，对外服务前必须补齐。
5. 静态设计门禁有 2 条因只支持 `.html` 而 `[SKIP]`，**跳过不等于通过**，已用 Playwright 真渲染补证。
6. 移动端强调色 5.9% 略超建议值，见第 5 节说明。
7. 未安装任何付费软件、未创建云资源、未启用任何付费 AI API、未公开代码仓库。

## 9. 下一步任务（需人工审批后才执行）

**当前停在前端确认闸门。** 按「AI 主导开发 + 人工审批 + 用户逐步学习」，
请确认：① 首页整体方向；② 有无一眼别扭处；③ 功能范围是否确实只是骨架。

确认后进入 Sprint 2/3：
1. 生成第二批迁移文件（`files`、`research_*`、`task_logs`、`project_milestones`）
2. 补齐项目/任务最小版交互（状态流转、编辑）
3. 文件中心元数据管理与上传限制（类型/大小/不可信内容处理）

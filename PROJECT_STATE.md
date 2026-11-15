# 项目状态

> 最后更新：2026-11-15 · 第三阶段交付（执行引擎 + 文件上传）

## 当前阶段

Sprint 1 骨架 + V2 重做 + **P0-1 执行引擎** + **P0-3 文件上传** 已完成并通过验证。
**19 个模块可增删改查；任务可派 Agent 真实执行；文件可真实上传下载。**
配色已定稿：**深色专业**（`DEFAULT_THEME = "dark"`）。

## 已完成（带产物）

### 基础工程与数据

| 项 | 产物路径 |
|---|---|
| 工程骨架（Next.js 16.4.6 + React 19 + TS + Tailwind 4） | `package.json`、`tsconfig.json`、`next.config.ts` |
| 数据模型 39 张表 / 7 个域文件 | `src/db/schema/*.ts` |
| 3 个迁移（全部已应用并进 Git） | `src/db/migrations/0000..0002` |
| 通用 CRUD 内核（含 snake→camel 转换） | `src/modules/store.ts` |
| 19 份模块定义 | `src/modules/defs/*.ts` |
| 通用模块页 | `src/app/[section]/page.tsx` |
| 三套配色 + 版式系统 | `src/app/globals.css`、`src/lib/config/theme*.ts` |
| 首页三段式（对话→结果→沉淀） | `src/app/page.tsx` |

### 本轮新增（2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| **Agent 执行引擎**（文档 5.3 的 12 步链路） | `src/server/ai/orchestrator/executor.ts` | F-08 / F-10 |
| 六个 Agent 的研究框架模板（无模型时的真实产出） | `src/server/ai/agents/framework.ts` | — |
| 任务执行接口 + 执行历史 | `src/app/api/v1/tasks/[id]/run/route.ts` | F-08 |
| Agent 直接执行接口（slug 或 UUID） | `src/app/api/v1/agents/[id]/run/route.ts` | F-08 |
| 执行结果浮层 + 行内「执行」按钮 | `src/components/modules/module-client.tsx` | F-08 |
| **文件上传/下载服务**（类型、大小、伪装三重校验） | `src/server/services/files.ts` | F-12 |
| 上传 / 列表 / 下载接口 | `src/app/api/v1/files/**` | F-12 |
| 拖拽上传控件 | `src/components/modules/file-upload.tsx` | F-12 |
| 文件表格（带下载与校验和） | `src/components/modules/file-table.tsx` | F-12 |
| 权限改为层级累加（L2 可 analyze） | `src/server/permissions/policy.ts` | — |
| 差距分析（对照蓝图逐条） | `docs/GAP-ANALYSIS.md` | — |

## 验证结果（真跑，非声称）

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 退出码 0 |
| `npm test` | **60 / 60 通过**（9 个测试文件） |
| `npm run build` | 退出码 0，全部路由按需渲染 |
| 执行成功流 | HTTP 201，`agent_runs` 1 行 / `agent_messages` 2 条 / `task_logs` 1 条 / 任务转 `review` |
| 执行次数上限 | 第 4 次返回 **429 `RUN_LIMIT_EXCEEDED`** |
| 并发占位 | 任务处于执行中再请求 → **409 `TASK_ALREADY_RUNNING`** |
| 错误分支 | `TASK_NOT_FOUND` 404 / `AGENT_NOT_FOUND` 404 / L4 拒绝 403 |
| 上传成功流 | 201，磁盘落盘 + SHA-256 + 元数据入库，路径 `用户/年月/uuid.png` |
| 上传错误分支 | 415 类型 / 413 超限 / 415 MIME 伪装 / 422 空文件 / 422 无文件 / 415 非 multipart |
| 下载一致性 | 下载后 sha256 与原文件**完全一致**；磁盘缺件返回 410 |
| 路径穿越 | `../../etc/passwd` 与绝对路径均被拒绝 |
| 浏览器实测 | 真实拖入文件上传成功；点执行弹出浮层；1440 / 375 均 0 横向溢出 |

## 待决策

| 项 | 选项 | 推荐 |
|---|---|---|
| 是否接入真实模型 | 继续 `none` / 启用 `mock` / 接付费 API | **继续 none**，等明确预算再谈 |
| 下一步做哪块 | 工作流执行引擎 / 报告导出 / 财务多价位对比 | **工作流执行引擎**（Agent 执行已具备，最缺的是串成流水线） |

## 下一步（≤3）

1. 工作流执行引擎：把蓝图第 8 节 15 节点跑起来，写 `workflow_runs`
2. 报告生成与导出（Markdown / PDF），接在工作流终点
3. Agent 中心展示执行记录（数据已在 `agent_runs`，只差页面）

## 已知风险

- 无登录认证：只可本机/受控网络使用，**禁止暴露公网**
- 工作流中心只有定义，无执行引擎（导航已标「部分」，不伪装成可用）
- AI 未接入，执行产出为「研究框架」，UI 明示「不含研究结论、不产生费用」
- 上传文件不解析内容（无毒扫描、不做文本提取），仅存储与元数据
- Windows 实机未验证（Linux 沙箱完成构建与运行验证，Windows 步骤见 README）

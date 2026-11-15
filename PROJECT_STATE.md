# 项目状态

> 最后更新：2026-11-15 · 第九阶段交付（移动端导航 + 验收标准）

## 当前阶段

Sprint 1 骨架 + V2 重做 + **P0-1 执行引擎** + **P0-3 文件上传** + **P0-2 工作流引擎** + **P0-4 报告导出** + **P1-5 财务多售价对比** + **P0-5 中断后续跑** + **P1-6 执行记录** + **P1-8 移动端导航** 已完成并通过验证。
**19 个模块可增删改查；任务可派 Agent 真实执行；文件可真实上传下载；三条工作流可跑完整链路、停在人工闸门、中断后从失败节点续跑；报告可导出 .md 与可打印页面；财务可一表看五档定价；每次执行都能查到输入、产出全文与产出方式；手机上一屏点开完整导航；任务的验收标准能真正写进库并传给 Agent。**

**P0 清单已清空。**
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

### 本轮新增（移动端导航与验收标准，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 窄屏导航改为顶部汉堡 + 左滑抽屉（遮罩拦点击、ESC 关闭、选页收起、Tab 圈定、inert） | `src/components/layout/sidebar.tsx`、`src/app/globals.css` | F-02 |
| 品牌区「CrossBorder AI / WORKSPACE」两行文字重叠修复 | `src/app/globals.css` | — |
| 任务验收标准字段（≤2000 字，落库并作为 Agent 输入） | `src/lib/validation/schemas.ts`、`src/server/services/workspace.ts` | 文档 6 |
| 导航图标 menu / close（继续走内联 SVG，不引图标包） | `src/components/ui/icons.tsx` | — |

### 本轮新增（执行记录，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 记录读取层（模式判定 / 统计 / 详情 / 跨用户隔离） | `src/server/services/agent-runs.ts` | 文档 6 |
| 单次执行详情接口 | `src/app/api/v1/agent-runs/[id]/route.ts` | 文档 6 |
| 执行记录页（统计、筛选、日期分段、展开全文、复制产出） | `src/components/modules/agent-runs.tsx` | 文档 7 |
| 导航新增「执行记录」+ 列表图标 | `src/lib/config/navigation.ts`、`src/components/ui/icons.tsx` | — |

### 上轮新增（中断后续跑，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 续跑判定与状态迁移（纯函数，含定义指纹） | `src/server/ai/workflows/resume.ts` | 文档 7.x |
| 续跑接口 `POST /workflow-runs/:id/resume` | `src/app/api/v1/workflow-runs/[id]/resume/route.ts` | 文档 6 |
| 引擎续跑（条件更新防并发、写审计、续跑历史） | `src/server/ai/workflows/engine.ts` | — |
| 续跑幂等（复用任务 / 覆盖报告 / 覆盖归档） | `src/server/ai/workflows/step-runner.ts` | — |
| 工作流中心续跑区（重试 / 跳过，跳过须写原因） | `src/components/modules/workflow-center.tsx` | — |

### 上轮新增（财务多售价对比，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 财务口径抽到纯函数层（服务端 / 卡片 / 对比共用一份） | `src/lib/finance/calc.ts` | 文档 7.6 |
| 多售价对比组件（五档、保本售价、边际净利） | `src/components/modules/price-ladder.tsx` | 文档 7.6 |
| 口径与命名兼容的回归测试 | `tests/unit/price-ladder.test.ts` | — |

### 上轮新增（报告导出，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 受限 Markdown 渲染（先转义再还原标签，拒 javascript: 协议） | `src/server/services/report-render.ts` | 文档 7.x |
| 报告装载 / Markdown 构建 / 可打印 HTML 生成 | `src/server/services/reports.ts` | 文档 7.x |
| 导出接口（md / html / pdf 重定向） | `src/app/api/v1/reports/[id]/export/route.ts` | 文档 6 |
| 报告页导出区（两种格式说明 + 逐条下载） | `src/components/modules/report-export.tsx` | 文档 7 |

### 上轮新增（工作流执行引擎，2026-11-15）

| 项 | 产物路径 | 对应验收 |
|---|---|---|
| 工作流定义与解析（3 条内置流程，9 种节点类型） | `src/server/ai/workflows/definitions.ts` | 文档 8 |
| 调度器（原子占位、状态机、逐步落库） | `src/server/ai/workflows/engine.ts` | 文档 8 |
| 节点执行器（9 种类型各自的真实行为） | `src/server/ai/workflows/step-runner.ts` | 文档 8 |
| 汇总 / 报告 / 核对规则（纯函数，可单测） | `src/server/ai/workflows/helpers.ts` | 文档 5.3 第 8 步 |
| 5 个工作流接口 | `src/app/api/v1/workflows/**`、`workflow-runs/**` | 文档 6 |
| 工作流中心页面（时间线 + 闸门 + 产出展开） | `src/components/modules/workflow-center.tsx` | 文档 7 |
| 内置流程 seed（幂等，不覆盖用户改动） | `scripts/seed.ts` | — |

## 验证结果（真跑，非声称）

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 退出码 0 |
| `npm test` | **168 / 168 通过**（16 个测试文件） |
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
| 工作流主流程 | 点一次「开始运行」跑到节点 13 闸门：11 个节点完成、2 个标未执行、2 个待执行 |
| 闸门不可绕过 | 未批准时 `advance` 返回 `executed: []`，`currentNode` 仍是 `s13` |
| 闸门批准后 | 节点 14 真实写 `knowledge_items`，5 个节点任务全部 `done`，运行转 `succeeded` |
| 工作流错误分支 | 404（流程/运行不存在）· 409（已结束/并发）· 422（定义不合法、goal 类型错）全部命中 |
| 工作流 HTTP 实测 | 26 项断言全部通过（含 3 条内置流程、节点状态、页面渲染） |
| 导出 HTTP 实测 | 29 项断言全过（md / html / pdf 重定向 / 422 / 404 / 页面入口） |
| 导出 PDF 实测 | 真实调用浏览器打印管线，7 页 A4，`pdftotext` 可提取中文（字体已嵌入） |
| 导出 XSS 防护 | 正文 `<script>`、`<img onerror>`、`javascript:` 链接均被拦；HTML 走 nonce CSP |
| 财务数值 | 修复前页面显示 0.00 / −0.00 / 0.0% / —（全为 0）；修复后 17.06 / +2.84 / 14.3% / 1,058 单 |
| 多售价交互 | 基准价 19.9 → 改 25：五档重算，月利润由全负转全正，「亏最少」自动变成「最优」 |
| 非法输入 | 基准价填 0 后失焦，回退到 19.9，不留一个按 0 算的假结果 |
| 续跑 HTTP 实测 | 17 项断言全过（状态机 / 错误码 / 并发 / 审计 / 页面） |
| 续跑真实闭环 | 停用 Agent → 运行真的失败 → 启用 Agent → 界面点「重试」→ 同一条任务、同一批前序产出，跑到闸门 |
| 续跑幂等 | 重试后任务数不变（1 条），报告与归档覆盖同一条记录，不产生重复 |
| 续跑并发 | 两个 retry 同时发：一个 200、一个 409 RUN_BUSY |
| 执行记录统计 | 30 次 = 2 次模拟输出 + 27 次框架模板 + 1 次失败无产出，三数之和与实际产出次数对得上 |
| 执行记录失败态 | 真实制造一次 Provider 503，落库为 failed；页面标「无产出」而不是「模拟输出」，不谎称产出过 |
| 执行记录详情 | 展开后输入与产出全文可读，产出可一键复制；跨用户 id 一律 404 |
| 执行记录响应式 | 1440 / 834 / 375 均 0 横向溢出；窄屏展开不裁切 |

## 待决策

| 项 | 选项 | 推荐 |
|---|---|---|
| 是否接入真实模型 | 继续 `none` / 启用 `mock` / 接付费 API | **继续 none**，等明确预算再谈 |
| 下一步做哪块 | 总管家结果汇总 / 移动端导航 / 任务验收标准 | **总管家结果汇总**（移动端导航与验收标准已完成，见下） |

## 下一步（≤3）

1. 总管家「执行结果汇总」（执行完回对话区就能看结果，不用跳到任务列表）
2. CI：仓库已推送，需在 GitHub 侧启用 Actions 跑测试
3. 登录与多用户隔离（上公网前必须）

> 远程仓库状态：`github.com/ogwei20-commits/aidsck`，`main` 已推送 9 个提交。
> 本沙箱到 `github.com:443` 的 git 协议不通，推送走 `scripts/push-via-api.py`（Git Data API），
> 支持基于远端 tip 的增量续推；内容一致性用 tree sha 比对（本地与远端相同即逐字节一致）。

## 已知风险

- 无登录认证：只可本机/受控网络使用，**禁止暴露公网**
- 工作流失败即中断，不支持从失败节点续跑；长流程失败需重开一次运行
- 工作流未做定时/触发式运行，只能手动推进（无任务队列）
- AI 未接入，执行产出为「研究框架」，UI 明示「不含研究结论、不产生费用」
- 上传文件不解析内容（无毒扫描、不做文本提取），仅存储与元数据
- Windows 实机未验证（Linux 沙箱完成构建与运行验证，Windows 步骤见 README）

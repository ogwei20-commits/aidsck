# 09 · 测试计划

> 来源：文档第 10 节 Sprint 7 与第 11 节验收门槛。测试不许凑数，不许伪造结果。
> 当前规模：**24 个文件 / 229 个用例，全部通过**（2026-11-15）。

## 1. 分层策略

| 层 | 工具 | 范围 | 当前状态 |
|---|---|---|---|
| 单元 | Vitest | Zod 校验、权限策略、拆解模板、调度器、财务口径、报告渲染、错误翻译 | 已实现（14 文件 / 150 例） |
| 集成 | Vitest + 真实 PostgreSQL | 项目/任务读写、执行、工作流与续跑、文件、里程碑、来源、列表查询 | 已实现（10 文件 / 79 例） |
| API | curl + 运行中的生产服务 | 成功流、错误码、跨用户隔离 | 每轮交付前手动执行，结果写进 `PROJECT_STATE.md` |
| 数据库 | `npm run db:check` + 集成测试 | 连接、表结构、行数、外键 | 已实现 |
| 备份恢复 | pg_dump / pg_restore 到临时库 | F-15 | 已演练 |
| 浏览器 | Playwright（Chromium） | 表单交互、翻页、筛选、确认完成、375/834/1440 三档溢出 | 已实现（按轮次执行，脚本不入库） |
| 安全 | 审批闸门 + 越权用例 | 权限、跨用户 404、路径穿越、协议白名单 | 已覆盖 |

## 2. 用例清单（按文件）

### 单元（14 文件 / 150 例）

| 文件 | 例数 | 覆盖 |
|---|---|---|
| `unit/schemas.test.ts` | 10 | 项目/任务/审批输入、默认值、边界长度、空 PATCH |
| `unit/permissions.test.ts` | 12 | L1–L4 分级、工具白名单、未实现工具拒绝 |
| `unit/planner.test.ts` | 6 | 关键词命中、缺口补齐、同一 Agent 不重复、人工标注 |
| `unit/dispatcher.test.ts` | 4 | 逐条派发、单条失败不中断、任务缺失跳过、成功≠完成 |
| `unit/finance.test.ts` | 6 | 单件成本、净利、毛利率、保本单量、零售价 |
| `unit/price-ladder.test.ts` | 20 | 五档生成、保本价、边际净利、非法基准价回退、命名兼容 |
| `unit/report-render.test.ts` | 27 | 受限 Markdown、XSS 拦截、附录结构、导出文件名 |
| `unit/citations-schema.test.ts` | 11 | 链接协议白名单、标题/引文长度、UUID、数据类型、财务入参 |
| `unit/humanize.test.ts` | 5 | 连接失败/迁移缺失/查询失败三类翻译、截断、非 Error 输入 |
| `unit/milestones.test.ts` | 5 | 日期只到天、PATCH 只改传入字段、非法日期 |
| `unit/store-search.test.ts` | 6 | LIKE 通配符转义、字段白名单、页码夹取 |
| `unit/workflow-helpers.test.ts` | 14 | 汇总、报告汇编、核对规则 |
| `unit/workflow-resume.test.ts` | 19 | 续跑状态迁移、定义指纹、闸门不可跳过 |
| `unit/framework.test.ts` | 5 | 六个 Agent 的框架模板结构与标注 |



### 集成（10 文件 / 79 例，全部连真库）

| 文件 | 例数 | 覆盖 |
|---|---|---|
| `integration/workspace.test.ts` | 7 | 项目/任务读写、审计日志、首页汇总 |
| `integration/permissions.test.ts` | 2 | 未审批归档 403、审批后放行 |
| `integration/run.test.ts` | 7 | 执行成功流、次数上限 429、并发 409、错误分支 |
| `integration/files.test.ts` | 9 | 上传落盘、SHA-256、类型/大小/伪装、下载一致、路径穿越 |
| `integration/workflow.test.ts` | 10 | 三条流程、闸门、节点状态、错误码 |
| `integration/workflow-resume.test.ts` | 7 | 重试/跳过、幂等、并发 RUN_BUSY |
| `integration/agent-runs.test.ts` | 19 | 统计口径、模式判定、详情、跨用户、筛选、分页、跨页 attemptNo |
| `integration/milestones.test.ts` | 6 | 增删改、分组、逾期、完成态不被标题覆盖 |
| `integration/citations.test.ts` | 6 | 登记、计数、跨用户 404、删除、50 条上限 |
| `integration/list-query.test.ts` | 6 | 搜索转义、分页边界、总数独立 count |

集成测试只创建带 `[测试]` 前缀的记录，`afterAll` 清理；跑完不残留业务数据。

## 3. 怎么跑

```bash
npm run typecheck
npm run lint
npm test
npm run db:check
npm run build
```

测试需要 `DATABASE_URL` 已配置且迁移已应用；未配置时集成测试会明确报错，不会静默跳过。

浏览器验证（按轮次执行）：生产构建后 `npm run start:lan`，用 Playwright 连真实 Chromium，
覆盖表单提交、翻页、筛选、确认完成与三档视口溢出检查。

## 4. 验收纪律

- 不做「为覆盖率而覆盖率」的测试
- 不把静态页面标成完整功能，不把模拟 AI 标成真实 AI，不把模拟数据标成真实数据
- 未通过项在 `docs/ACCEPTANCE-SPRINT-1.md` 明确标「未完成」
- 验证权归位：实现者自检，QA/验收报告基于真实命令输出
- 新增功能必须同时给：一条成功路径、一条边界、一条越权/非法输入

# 09 · 测试计划

> 来源：文档第 10 节 Sprint 7 与第 11 节验收门槛。测试不许凑数，不许伪造结果。

## 1. 分层策略

| 层 | 工具 | 范围 | 当前状态 |
|---|---|---|---|
| 单元 | Vitest | Zod 校验、权限策略、工具白名单、Agent 定义、Provider 状态 | 已实现 |
| 集成 | Vitest + 真实 PostgreSQL | 项目/任务读写、审计日志、首页汇总、审批闸门 | 已实现 |
| API | curl + 运行中的 dev server | /api/v1/* 成功流与错误流 | 手动执行，输出见验收报告 |
| 数据库 | `npm run db:check` + 集成测试 | 连接、表结构、行数、外键 | 已实现 |
| 备份恢复 | pg_dump / pg_restore 到临时库 | F-15 | 已演练 |
| E2E | Playwright | 页面导航、表单交互 | ⬜ 未执行（S7，浏览器依赖待装） |
| 安全 | 审批闸门测试 + 人工检查 | 权限、密钥、越权 | 部分（S7 补齐） |

## 2. 当前用例清单

**`tests/unit/schemas.test.ts`**（7 例）
合法项目默认值、过短名称、超长描述、R/E/P/S/U 枚举、空 PATCH、越界进度、任务默认来源。

**`tests/unit/permissions.test.ts`**（8 例）
L4 拒绝、L1 只读、L2 可写、外部工具禁止、未实现工具禁止、已实现工具可用、
默认 Provider 非真实、六 Agent 均为规划态且限制齐备。

**`tests/integration/workspace.test.ts`**（6 例）
创建并读回、修改落库、任务关联项目、列表包含新项目、每次写入产生审计日志、首页汇总来自真实查询。

**`tests/integration/permissions.test.ts`**（2 例）
无审批归档被 403 阻止；写入审批后归档成功。

集成测试只创建带 `[测试]` 前缀的数据，跑完在 `afterAll` 中清理，不污染业务数据。

## 3. 怎么跑

```bash
npm run typecheck
npm run lint
npm test
npm run db:check
npm run build
```

测试需要 `DATABASE_URL` 已配置且迁移已应用；未配置时集成测试会明确报错，不会静默跳过。

## 4. 验收纪律

- 不做「为覆盖率而覆盖率」的测试
- 不把静态页面标成完整功能，不把模拟 AI 标成真实 AI，不把模拟数据标成真实数据
- 未通过项在 `docs/ACCEPTANCE-SPRINT-1.md` 明确标「未完成」
- 验证权归位：实现者自检，QA/验收报告基于真实命令输出

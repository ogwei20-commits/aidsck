# 04 · AI Agent 设计

> 来源：文档第 5 节。当前状态：**6 个 Agent 已落库并接入执行器，可被真实派活**。

## 1. 六个核心 Agent

默认定义在 `src/server/ai/agents/registry.ts`，运行时以 `agents` 表为准（`npm run db:seed` 幂等写入）。

| Agent | 职责 | 权限 | 工具白名单 |
|---|---|---|---|
| Supervisor | 总管家：拆解、分配、汇总 | L2 | task.create, project.read, approval.request |
| Market Analyst | 市场研究 | L1 | research.read, knowledge.read |
| Platform Analyst | 平台比较 | L1 | research.read, knowledge.read |
| Product Researcher | 产品与竞品 | L1 | research.read, product.read, knowledge.read |
| Finance Analyst | 成本与利润 | L2 | finance.calculate, product.read |
| Learning Mentor | 学习与训练 | L2 | learning.read, growth.read |

供应链与合规**没有对应 Agent**：相关任务在拆解时直接标「需人工执行」，不建空壳角色。

## 2. 执行流程（`executor.ts` 落地）

```
读任务并校验归属
  → 选择 Agent（任务上指定的，或调用时显式传入）
  → 权限校验（按 Agent 自身等级，不按调用方）
  → 次数上限检查（同一任务 ≤3 次）
  → 原子占位（并发请求第二个直接 409）
  → 调用 Provider 生成产出
  → 写 agent_runs / agent_messages / task_logs
  → 质量检查（长度、模式标注、结论字段）
  → 任务转 review（待确认）
  → 审计日志
```

**三条不可违反的约束**：

1. 没有模型时绝不冒充 AI：产出「研究框架」，标 `mode=framework`、`hasConclusion=false`
2. Agent 不能自行提权：执行前按 Agent 自己的 `permissionLevel` 校验
3. 执行成功 ≠ 任务完成：任务只到 `review`，`done` 必须人工确认

## 3. 三种产出方式（必须区分）

| `mode` | 触发条件 | 产出是什么 | 能否当结论 |
|---|---|---|---|
| `framework` | `AI_PROVIDER=none` | 研究框架：要回答的问题、要核对的项、交付物结构 | 否，明确标注不含结论 |
| `mock` | `AI_PROVIDER=mock` | 本地模拟文本，强制标「模拟输出」 | 否，仅验证链路 |
| `model` | 真实 Provider | 模型生成内容 | 仍需人工核验来源 |
| `none` | 执行失败、无产出 | 无 | 否，页面上标「无产出」而不是某种产出方式 |

执行记录页的统计**按这三种方式分别计数**，失败不计入任何一种产出方式——把失败混进「模拟输出」会让分类之和大于实际产出次数。

## 4. 执行限制

- 单任务执行次数上限 3 次（第 4 次 429 `RUN_LIMIT_EXCEEDED`）
- 并发占位：同一任务已在执行时再请求 → 409 `TASK_ALREADY_RUNNING`
- 单次超时 120 秒（Agent 定义里的 `timeoutSeconds`）
- 工具白名单：`TOOL_REGISTRY`，未实现工具一律不可用
- `external_call` 为 L4，任何等级都禁止
- 质量检查不通过：任务停在 `review` 并记录问题，不静默通过

## 5. AI Provider 策略

统一接口 `AIProvider.generate({ systemPrompt, messages })`，业务层不依赖任何厂商 SDK。

| 模式 | 行为 | 费用 |
|---|---|---|
| `none`（默认） | 明确提示「AI 未配置」，不调用任何模型 | 0 |
| `mock` | 本地模拟，输出强制标注「模拟输出 · 非真实 AI」 | 0 |
| `openai-compatible` | 适配器未实现，尝试启用返回 403 + 需人工批准提示 | 0 |

> 未经批准不得擅自选择付费 AI API。当前不写任何真实模型调用代码，避免误触发费用。

## 6. 总管家调度（`dispatcher.ts`）

- 只派有 Agent 的步骤；人工环节留在 `pending` 并标注原因
- 单条失败不中断整批，失败原因逐条回传
- 同步执行：框架/模拟模式毫秒级，一批 ≤6 条
- **接入真实模型后必须改成后台队列**，否则 HTTP 请求会超时

## 7. 明确未完成

- 交叉审核（第二个 Agent 独立复核）：留到后续
- 预算消耗记录与费用估算
- Agent 自定义注册界面（当前 6 个为内置定义，可通过数据库扩展）

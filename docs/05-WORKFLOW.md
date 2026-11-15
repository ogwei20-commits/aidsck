# 05 · 工作流设计

> 来源：文档第 8 节。当前状态：**执行引擎已实现并通过验证**（2026-11-15）。
> 未做：可视化流程设计器（文档 8 明确第一阶段不做）、报告导出（P0-4）。

## 1. 三条内置流程

定义随代码发布，`npm run db:seed` 写入 `workflows` 表。

| 流程 | 节点数 | 用途 |
|---|---|---|
| **跨境电商创业可行性研究** | 15 | 完整链路：目标 → 四个分析环节 → 汇总 → 证据核对 → 报告 → 人工审核 → 归档 |
| **选品验证** | 6 | 短链路：候选品 → 竞品核对 → 单件测算 → 拍板 → 归档。适合每周跑 |
| **周度复盘** | 4 | 三段式：本周事实 → 偏差分析 → 下周动作 |

流程定义是**数据不是代码**：`workflows.definition` 存 JSON，改流程不用改引擎。
seed 默认不覆盖库里已有的定义（避免冲掉用户改动），需要同步时用 `npm run db:seed -- --reset-workflows`。

## 2. 节点类型

九种类型，每种只有一种行为，没有「万能节点」。

| 类型 | 谁执行 | 产出去哪 | 会不会停 |
|---|---|---|---|
| `start` | 系统 | 创建或复用项目，`projects` 表 | 否 |
| `manual` | 人 | 节点输出存 `workflow_runs.context` | **是**（无输入时） |
| `agent` | Agent 执行引擎 | 新建任务 → `agent_runs` / `agent_messages` / `task_logs` | 否 |
| `summary` | 系统 | 前序产出按固定结构拼接，不调模型 | 否 |
| `check` | 系统 | 按清单核对，输出阻断项与提示项 | 阻断项非空时**是** |
| `report` | 系统 | `reports` 表（状态 draft） | 否 |
| `gate` | 人 | 审批写 `audit_logs` | **是**（必须批） |
| `archive` | 系统 | `knowledge_items` 表 | 否 |
| `deferred` | — | 标 `skipped` 并写明原因 | 否 |

`deferred` 是刻意设计的：节点 8（供应链与合规）与节点 15（成长档案）本阶段不实现，
就明确标成「未执行 + 原因」，而不是跑一个空壳然后显示「已完成」。

## 3. 状态机

```
queued ──advance──► running ──► succeeded
  ▲                    │
  └──遇到 waiting──────┘
                       └──► failed
queued ──decide(reject)──► cancelled
```

- **queued** 有两种含义：还没开始、等人处理。真正的判断依据是「有没有 `status=waiting` 的节点」。
- **running** 只是并发占位，抢不到就 409，不会出现两条流水线同时改一个 run。
- 一次 `advance` 最多推进 `max(12, 节点数 + 2)` 步，停在三处：人工节点、闸门、核对阻断项。

## 4. 三条不可违反的约束怎么落地

| 约束 | 落地方式 |
|---|---|
| **人工闸门不可跳过** | 有 waiting 节点时 `advance` 直接返回不推进；`decide` 是唯一出口，写 `audit_logs` |
| **执行成功 ≠ 任务完成** | Agent 节点的任务停在 `review`；**只有闸门批准时**才批量置 `done` |
| **不伪造 AI 产出** | 无模型时 Agent 产出为研究框架（`mode=framework`），报告正文明确写「尚无经人工确认的研究结论」 |

## 5. 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/v1/workflows` | 流程列表 + 最近一次运行 |
| POST | `/api/v1/workflows/:id/run` | 启动一次运行并推进到第一个停点（id 支持 slug 或 UUID） |
| GET | `/api/v1/workflow-runs/:id` | 读运行状态（不推进） |
| POST | `/api/v1/workflow-runs/:id/advance` | 推进到下一个停点 |
| POST | `/api/v1/workflow-runs/:id/decide` | `approve` 继续 / `reject` 终止 |

错误码：`WORKFLOW_NOT_FOUND` 404 · `RUN_NOT_FOUND` 404 · `RUN_BUSY` 409 ·
`RUN_FINISHED` 409 · `NOTHING_TO_DECIDE` 409 · `WORKFLOW_DEFINITION_INVALID` 422。

## 6. 数据落点

一次完整运行（可行性流程）会在这些表留下记录：

| 表 | 本次写入 |
|---|---|
| `projects` | 1 行（节点 1） |
| `tasks` | 5 行（节点 3–7），闸门批准后转 `done` |
| `agent_runs` | 5 行 |
| `agent_messages` | 10 行（每次执行 user + assistant 各一条） |
| `task_logs` | 5+ 行 |
| `reports` | 1 行（节点 12，状态 draft） |
| `knowledge_items` | 1 行（节点 14） |
| `audit_logs` | 启动、每个 L3 决策、报告与归档 |
| `workflow_runs` | 1 行（context 存全部节点状态） |

## 7. 已验证的行为

`tests/integration/workflow.test.ts`（10 项）+ `tests/unit/workflow-helpers.test.ts`（13 项）：

- 主流程 13 步内停在节点 13，节点 8/15 标 skipped 且带原因
- 闸门未批准时 `advance` 返回 `executed: []`，不绕过
- 批准后节点 14 真实写知识库，5 个任务全部转 `done`
- 驳回终止运行但不删除已有项目与产出
- 没有目标时停在人工节点，不猜用户想做什么
- 定义不合法（缺类型 / id 重复 / agent 缺 slug / deferred 无原因）直接拒绝启动
- 无报告节点的流程，归档退回到产出汇总而不是报错

HTTP 层另测 26 项（含 404 / 409 / 422 分支），全部通过。

## 8. 本阶段没做的

| 事项 | 原因 |
|---|---|
| 可视化流程设计器 | 文档 8 明确第一阶段不做 |
| 报告导出（Markdown / PDF） | P0-4，报告已落库，导出接在 `reports.body` 上 |
| 节点 8 供应链与合规 | 第二阶段范围 |
| 节点 15 成长档案 | S6 范围，能力评分必须有依据 |
| 失败节点重试 | 当前失败即中断，重跑请新建运行（避免半成品状态混淆） |
| 定时/触发式运行 | 需要任务队列与调度，当前只有手动推进 |

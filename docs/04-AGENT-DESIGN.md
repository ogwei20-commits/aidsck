# 04 · AI Agent 设计

> 来源：文档第 5 节。当前状态：**接口与注册定义已建立，调度器未启用**。

## 1. 六个核心 Agent（注册定义已落地）

`src/server/ai/agents/registry.ts` 中为静态定义，全部 `status: "planned"`，
包含文档 5.2 要求的全部字段：agent_id / name / description / role / system_instructions /
allowed_tools / input_schema / output_schema / permission_level / execution_limit /
max_model_calls / timeout / status / version。

| Agent | 职责 | 权限 | 工具白名单 |
|---|---|---|---|
| Supervisor | 总管家、拆解任务、分配 | L2 | task.create, project.read, approval.request |
| Market Analyst | 市场研究 | L1 | research.read, knowledge.read |
| Platform Analyst | 平台比较 | L1 | research.read, knowledge.read |
| Product Researcher | 产品与竞品 | L1 | research.read, product.read, knowledge.read |
| Finance Analyst | 成本与利润 | L2 | finance.calculate, product.read |
| Learning Mentor | 学习与训练 | L2 | learning.read, growth.read |

供应链专家、合规专家、报告专家后续增加。

## 2. 执行流程（文档 5.3，S4 启用）

用户目标 → 总管家分析 → 创建任务与验收标准 → 选择 Agent → 检查权限与预算 → 执行 →
保存日志 → 质量检查 → 交叉审核 → 提交结果 → **用户确认**。

## 3. 执行限制（已落地为常量与白名单）

- 最大执行次数 5、最大模型调用 10、超时 120 秒（每个 Agent 独立配置）
- 工具访问白名单：`TOOL_REGISTRY`，未实现工具一律不可用
- `external_call` 为 L4，**任何等级都禁止**
- Agent 不能自行提权、不能购买付费服务、不能外发未授权数据

## 4. AI Provider 策略（文档 5.5）

统一接口 `AIProvider.generate({ systemPrompt, messages })`，业务层不依赖任何厂商 SDK。

| 模式 | 行为 | 费用 |
|---|---|---|
| `none`（默认） | 明确提示「AI 未配置」，不调用任何模型 | 0 |
| `mock` | 本地模拟，输出强制标注「模拟输出 · 非真实 AI」 | 0 |
| `openai-compatible` | **未实现**，尝试启用返回 403 + 需人工批准提示 | 0 |

> 未经批准不得擅自选择付费 AI API。第一阶段不写任何真实模型调用代码，避免误触发费用。

## 5. 明确未完成

`agents / agent_runs / agent_messages` 表、Dispatcher、Approval Manager、Execution Logger
的完整实现、预算消耗记录，均在 Sprint 4。首页 Agent 状态展示为「规划中」，不虚构运行次数。

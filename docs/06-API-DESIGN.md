# 06 · API 设计

> 来源：文档第 6 节。统一前缀 `/api/v1/`，全部 Route Handlers 声明 `force-dynamic`。

## 1. 统一约定

- 输入：**全部 Zod 校验**，失败返回 `422 VALIDATION_FAILED` + 字段级错误
- 输出：`{ "ok": true, "data": ... }` / `{ "ok": false, "error": { "code", "message", "details" } }`
- 未知异常只回泛化信息，详细堆栈写服务端日志，**不向前端暴露内部密钥**
- 每次写入自动写 `audit_logs`
- 重要执行接口检查审批状态（归档已接入闸门）

## 2. 已实现端点

### 2.1 基础（Sprint 1）

| Method | Path | 用途 | 状态 |
|---|---|---|---|
| GET | `/api/v1/health` | 数据库真实连通 + 表清单 + AI Provider 状态 | 已实现 |
| GET / POST | `/api/v1/projects` | 项目列表 / 创建项目 | 已实现 |
| GET / PATCH | `/api/v1/projects/:id` | 项目详情 / 修改（归档需审批） | 已实现 |
| GET / POST | `/api/v1/tasks` | 任务列表 / 创建任务 | 已实现 |
| GET | `/api/v1/audit-logs` | 操作日志查询 | 已实现 |
| GET / POST | `/api/v1/approvals` | 审批记录列表 / 写入审批决定 | 已实现 |
| GET | `/api/v1/agents` | Agent 注册定义 + 工具白名单 + Provider 状态 | 已实现 |
| GET / POST | `/api/v1/modules/:module` | 通用模块列表 / 创建（15 个模块共用） | 已实现 |
| GET / PATCH / DELETE | `/api/v1/modules/:module/:id` | 详情 / 修改 / 删除（删除需审批） | 已实现 |
| POST | `/api/v1/assistant/plan` | AI 总管家拆解目标为任务 | 已实现 |

### 2.2 执行（2026-11-15 新增，对应 F-08 / F-10）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/v1/tasks/:id/run` | 请求执行任务。body 可选 `{ agentSlug }`，缺省用任务上已分配的 Agent |
| GET | `/api/v1/tasks/:id/run` | 读取该任务的执行历史（含 Agent 名、状态、耗时） |
| POST | `/api/v1/agents/:id/run` | 请求指定 Agent 执行。`:id` 支持 slug 或 UUID；body 传 `taskId` 或 `target`（传 target 时自动建任务） |

**执行语义**（必须如实呈现，不允许含糊）：

```json
{
  "runId": "uuid",
  "mode": "framework",          // framework | mock | model
  "isRealAI": false,            // 仅当接真实模型时为 true
  "hasConclusion": false,       // 框架模式恒为 false
  "output": "【Market Analyst · 研究框架】...",
  "quality": { "pass": true, "issues": [] },
  "taskStatus": "review",       // 执行成功≠任务完成，必须人工确认
  "disclaimer": "未调用任何模型，产出为内置研究流程框架，不含研究结论，不产生费用。"
}
```

**错误码**：

| HTTP | code | 触发条件 |
|---|---|---|
| 404 | `TASK_NOT_FOUND` | 任务不存在或不属于当前用户 |
| 404 | `AGENT_NOT_FOUND` | Agent slug / id 不存在 |
| 409 | `TASK_ALREADY_RUNNING` | 任务正在执行中（原子占位保护） |
| 409 | `AGENT_UNAVAILABLE` | Agent 状态不是 ready |
| 429 | `RUN_LIMIT_EXCEEDED` | 同一任务被同一 Agent 执行次数达上限（默认 3） |
| 504 | `AGENT_TIMEOUT` | 超过 Agent 的 timeoutSeconds |
| 403 | `PERMISSION_DENIED` | Agent 权限等级不允许该动作 |

### 2.3 文件（2026-11-15 新增，对应 F-12）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/files` | 文件列表（仅当前用户） |
| POST | `/api/v1/files` | 上传。`multipart/form-data`，字段 `file`（必填）、`purpose`（可选） |
| GET | `/api/v1/files/:id/download` | 下载原件。校验路径不越界、磁盘存在；缺件返回 410 |

**上传限制**：单文件 ≤ 20 MB；扩展名白名单 pdf/docx/xlsx/pptx/csv/md/txt/png/jpg/jpeg/webp/zip；**扩展名与 MIME 必须匹配**（防伪装）。

**错误码**：

| HTTP | code | 触发条件 |
|---|---|---|
| 413 | `FILE_TOO_LARGE` | 超过 20 MB |
| 415 | `FILE_TYPE_NOT_ALLOWED` | 扩展名不在白名单 |
| 415 | `MIME_MISMATCH` | 扩展名与声明类型不符 |
| 415 | `INVALID_CONTENT_TYPE` | 不是 multipart/form-data |
| 422 | `EMPTY_FILE` / `FILE_REQUIRED` | 空文件 / 未收到文件 |
| 410 | `FILE_MISSING_ON_DISK` | 有记录但磁盘缺件 |
| 400 | `PATH_TRAVERSAL` | 存储路径越界 |

## 3. 工作流（P0-2，已实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflows` | 流程列表 + 每条最近一次运行 + 完整定义（用于未运行时的节点预览） |
| POST | `/api/v1/workflows/:id/run` | 启动运行并推进到第一个停点；`id` 支持 slug 或 UUID |
| GET | `/api/v1/workflow-runs/:id` | 读运行状态，**不推进** |
| POST | `/api/v1/workflow-runs/:id/advance` | 推进到下一个停点（人工节点 / 闸门 / 失败 / 结束） |
| POST | `/api/v1/workflow-runs/:id/decide` | `{"decision":"approve"\|"reject","note":"..."}` |
| POST | `/api/v1/workflow-runs/:id/resume` | `{"action":"retry"\|"skip","note":"..."}` 中断后从失败节点续跑（见 4.5） |

**启动请求体**：

```json
{ "goal": "3 个月内用 2 万元验证家居类目在亚马逊美国站的可行性", "projectId": "可选" }
```

**响应体（关键字段）**：

```json
{
  "runId": "uuid",
  "workflowSlug": "product-feasibility",
  "status": "queued",
  "currentNode": "s13",
  "currentNodeTitle": "用户审核（人工闸门）",
  "executed": [{ "stepId": "s12", "title": "生成研究报告", "status": "succeeded" }],
  "needsHuman": true,
  "humanAction": "报告必须由本人确认后才能算完成。...",
  "context": { "goal": "...", "projectId": "uuid", "steps": { "s1": { "status": "succeeded" } } },
  "definition": { "steps": [] },
  "disclaimer": "当前未接入任何 AI 模型..."
}
```

**错误码**：

| HTTP | code | 触发条件 |
|---|---|---|
| 404 | `WORKFLOW_NOT_FOUND` | 流程不存在 |
| 404 | `RUN_NOT_FOUND` | 运行记录不存在或不属于当前用户 |
| 409 | `WORKFLOW_DISABLED` | 流程已停用 |
| 409 | `RUN_BUSY` | 同一运行正在执行（并发占位） |
| 409 | `RUN_FINISHED` | 已结束的运行不能再推进或决策 |
| 409 | `NOTHING_TO_DECIDE` | 没有等待人工处理的节点 |
| 409 | `ARCHIVE_EMPTY` | 归档节点没有任何可归档内容 |
| 422 | `WORKFLOW_DEFINITION_INVALID` | 定义结构不合法，拒绝启动 |

## 4. 报告导出（P0-4，已实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/reports/:id/export?format=md` | 下载 `.md`：正文原样 + 附录（来源清单 / 数据类型 / 导出信息） |
| GET | `/api/v1/reports/:id/export?format=html` | 自包含 HTML 单页，带打印工具栏，Ctrl+P 存 PDF |
| GET | `/api/v1/reports/:id/export?format=pdf` | 307 → `format=html&print=1`，由浏览器打印管线出 PDF |

**为什么 PDF 不由服务端生成**：服务端出 PDF 要嵌入中文字体（体积 + 授权 + 跨平台字体缺失），
而浏览器打印管线本身就是矢量输出、字体不丢、分页与页边距可调。第一阶段用后者，
不引入 PDF 库、不调用付费服务。接口语义上 `format=pdf` 仍然可用（重定向 + 自动唤起打印）。

**响应头**：

- `Content-Type: text/markdown; charset=utf-8` / `text/html; charset=utf-8`
- `Content-Disposition` 同时给 ASCII 兜底名与 `filename*=UTF-8''`（中文文件名不乱码）
- HTML 通道带 `Content-Security-Policy: default-src 'none'; script-src 'nonce-…'`，
  内联脚本只有「调 window.print()」这一件事，不放开 `unsafe-inline`

**错误码**：

| HTTP | code | 触发条件 |
|---|---|---|
| 404 | `REPORT_NOT_FOUND` | 报告不存在、不属于当前用户，或 id 不是合法 UUID |
| 422 | `EXPORT_FORMAT_UNSUPPORTED` | `format` 不是 md / html / pdf |

**正文渲染**：不引第三方 Markdown 库。正文先整体转义、再还原受控标签，
只支持标题 / 列表 / 引用 / 粗体 / 行内代码 / 链接 / 表格 / 分隔线 / 代码块；
`javascript:` 等协议直接退化为纯文本。报告正文来自 Agent 产出与用户输入，
这一步是 XSS 的唯一防线。

## 5. 中断后续跑（P0-5，已实现）

运行中断（`status=failed`）后，从失败的那个节点接着走，前面已完成的节点不重跑。

```
POST /api/v1/workflow-runs/:id/resume
{ "action": "retry" | "skip", "note": "原因（skip 必填，至少 4 个字）" }
```

| action | 语义 | 产出 |
|---|---|---|
| `retry` | 失败原因已修复，重跑这一步 | 节点状态回到 `pending` 后被重新执行；`attempts` +1 |
| `skip` | 这一步确实跑不通，标为未执行后继续 | 节点 `skipped`，`reason` 写「人工跳过：<原因>（原失败：<错误>）」 |

**三种不允许**，都是刻意的：

| HTTP | code | 触发条件 | 为什么 |
|---|---|---|---|
| 409 | `RUN_NOT_RESUMABLE` | 运行状态不是 `failed` | 只有中断才有「从哪儿接着跑」的问题 |
| 409 | `WORKFLOW_DEFINITION_CHANGED` | 启动后流程定义被改过（节点增删或改执行者） | 接着跑会按新顺序执行旧上下文，产出归属全乱；宁可重开一条 |
| 409 | `GATE_CANNOT_SKIP` | 对人工闸门用 `skip` | 闸门存在的前提就是不可绕过 |
| 409 | `RESUME_LIMIT_REACHED` | 同一步已重试 3 次仍失败 | 无限重试只会把同样的错重复三遍 |
| 400 | `RESUME_NOTE_REQUIRED` | `skip` 时原因少于 4 个字 | 跳过会在最终报告里留缺口，必须留下可追溯的理由 |

**幂等保证**（续跑最容易出错的地方）：

- `agent` 节点重试**复用同一条任务**，不新建——否则任务页出现两条同名任务，执行记录被拆到两处
- `report` 节点重试**覆盖写同一条报告**，报告 ID 与导出链接不变
- `archive` 节点重试**覆盖写同一条知识库条目**
- 失败时即便任务已建、记录已落库，也把 `taskId` / `recordId` 挂在节点上，续跑才接得住

**响应体**：与 `advance` 相同（`AdvanceResult`）。续跑历史在 `context.resumes[]`：

```json
"resumes": [{ "at": "...", "stepId": "s3", "stepTitle": "竞品与需求核对", "action": "retry", "attempt": 2, "note": "Agent 已重新启用" }]
```

节点上另有 `attempts`（已执行次数）与 `lastError`（上次失败原因，续跑后仍保留，便于事后核对）。

## 6. 尚未实现（文档 6 剩余）

```
POST /api/v1/finance/calculate      （独立计算接口；页面内已可算）
POST /api/v1/approvals/:id/decision （现用 POST /approvals 写入决定）
```

## 7. 真实调用示例

```bash
# 健康检查
curl -s http://localhost:3000/api/v1/health

# 创建项目
curl -s -X POST http://localhost:3000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"东南亚小家电可行性研究"}'

# 创建任务
curl -s -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"比较三个平台佣金","source":"user"}'

# 未经审批归档 → 403 APPROVAL_REQUIRED
curl -s -X PATCH http://localhost:3000/api/v1/projects/<id> \
  -H "Content-Type: application/json" -d '{"status":"archived"}'

# 启动工作流（会一路跑到人工闸门停下）
curl -s -X POST http://localhost:3000/api/v1/workflows/product-selection/run \
  -H "Content-Type: application/json" \
  -d '{"goal":"验证 3 个家居候选品的单件净利"}'

# 闸门未批时推进 → executed 为空，不绕过
curl -s -X POST http://localhost:3000/api/v1/workflow-runs/<runId>/advance

# 批准并继续
curl -s -X POST http://localhost:3000/api/v1/workflow-runs/<runId>/decide \
  -H "Content-Type: application/json" -d '{"decision":"approve","note":"同意进入打样"}'

# 中断后重试失败节点（前面已完成的节点不会重跑）
curl -s -X POST http://localhost:3000/api/v1/workflow-runs/<runId>/resume \
  -H "Content-Type: application/json" -d '{"action":"retry","note":"Agent 已重新启用"}'

# 跳过跑不通的节点（必须写原因，至少 4 个字）
curl -s -X POST http://localhost:3000/api/v1/workflow-runs/<runId>/resume \
  -H "Content-Type: application/json" -d '{"action":"skip","note":"该数据源已下线，本次跳过"}'

# 导出报告（-OJ 按服务端给的文件名保存，中文名不乱码）
curl -s -OJ "http://localhost:3000/api/v1/reports/<reportId>/export?format=md"

# 打开可打印页面（浏览器里 Ctrl+P 存 PDF）
curl -s "http://localhost:3000/api/v1/reports/<reportId>/export?format=html"
```

## 8. Next.js 16 注意

动态段 `params` 是 `Promise`，必须 `await ctx.params`；使用原生 `Response.json()`；
`GET` Route Handler 默认不缓存。代码已按内置版本文档实现，未使用旧版同步 API。

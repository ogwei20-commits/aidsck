# 06 · API 设计

> 来源：文档第 6 节。统一前缀 `/api/v1/`，全部 Route Handlers 声明 `force-dynamic`。

## 1. 统一约定

- 输入：**全部 Zod 校验**，失败返回 `422 VALIDATION_FAILED` + 字段级错误
- 输出：`{ "ok": true, "data": ... }` / `{ "ok": false, "error": { "code", "message", "details" } }`
- 未知异常只回泛化信息，详细堆栈写服务端日志，**不向前端暴露内部密钥**
- 每次写入自动写 `audit_logs`
- 重要执行接口检查审批状态（归档已接入闸门）

## 2. 已实现端点（Sprint 1）

| Method | Path | 用途 | 状态 |
|---|---|---|---|
| GET | `/api/v1/health` | 数据库真实连通 + 表清单 + AI Provider 状态 | 已实现 |
| GET / POST | `/api/v1/projects` | 项目列表 / 创建项目 | 已实现 |
| GET / PATCH | `/api/v1/projects/:id` | 项目详情 / 修改（归档需审批） | 已实现 |
| GET / POST | `/api/v1/tasks` | 任务列表 / 创建任务 | 已实现 |
| GET | `/api/v1/audit-logs` | 操作日志查询 | 已实现 |
| GET / POST | `/api/v1/approvals` | 审批记录列表 / 写入审批决定 | 已实现（骨架） |
| GET | `/api/v1/agents` | Agent 注册定义 + 工具白名单 + Provider 状态 | 已实现（标注 planned） |

## 3. 规划端点（文档 6，后续 Sprint）

```
POST /api/v1/tasks/:id/run          POST /api/v1/agents/:id/run
GET  /api/v1/workflows              POST /api/v1/workflows
POST /api/v1/workflows/:id/run      POST /api/v1/approvals/:id/decision
POST /api/v1/research               GET  /api/v1/products
POST /api/v1/finance/calculate      GET  /api/v1/reports
POST /api/v1/files
```

## 4. 真实调用示例

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
```

## 5. Next.js 16 注意

动态段 `params` 是 `Promise`，必须 `await ctx.params`；使用原生 `Response.json()`；
`GET` Route Handler 默认不缓存。代码已按内置版本文档实现，未使用旧版同步 API。

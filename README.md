# CrossBorder AI Workspace · 跨境电商 AI 智能体工作台

> Development Blueprint V1.0 · Phase 1 — Foundation & MVP
> 当前进度：**Sprint 0 + Sprint 1 + Sprint 2（数据库最小切片）**
> 运行方式：本机单人本地运行 · 优先免费 · 未经批准不产生任何付费费用

---

## 1. 这一版到底是什么

按《第一阶段开发实施文档》第 12 节的**第一条开发任务**：只建立基础工程、综合首页、导航和数据库连接，
不提前开发所有业务模块。这一版是**真实可跑的工程骨架**，不是原型、不是静态页面。

已经真实可用：

- Next.js 16 工程、TypeScript、Tailwind、ESLint，依赖版本写死并提交 `package-lock.json`
- 综合首页：任务、项目、操作日志、状态数字**全部来自 PostgreSQL**，没有写死在页面里的假数组
- 左侧导航：19 个模块逐项标注「已可用 / 最小版 / 规划中」，规划中模块只有诚实占位页
- 数据库连接：Drizzle ORM + 迁移文件 + 健康检查 + 备份恢复脚本
- 最小真实数据链路：创建项目 / 修改项目 / 创建任务 / 自动写审计日志
- 权限与审批骨架：L1–L4 分级、工具白名单、归档操作必须有人审批记录，否则 403
- AI Provider 统一接口：`none` 未配置（默认）/ `mock` 本地模拟（强制标注）/ 外部模型**未实现且拒绝启用**
- 自动化测试：Vitest 单元 + 集成（连真实数据库）

明确**尚未完成**（见 `docs/ACCEPTANCE-SPRINT-1.md`）：Agent 调度、工作流引擎、市场/选品/财务等研究业务、
文件上传、报告导出、学习成长、认证与多租户、完整审批中心 UI。

---

## 2. Windows 环境准备（Sprint 0）

目标设备：Windows 电脑，16GB RAM，本地运行，不使用 Docker。

| 软件 | 建议版本 | 说明 |
|---|---|---|
| Node.js | 22 LTS（本项目验证于 v22.13.1） | 官网安装包，勾选加入 PATH |
| Git | 2.43+ | 默认安装即可 |
| VS Code | 稳定版 | 建议装 ESLint / Tailwind 插件 |
| PostgreSQL | 16（本项目验证于 16.15） | 官方 Windows 安装包，安装时记住 postgres 密码、端口 5432 |
| GitHub | 私有仓库 | **由你本人创建**；本项目不会擅自创建或公开仓库 |

安装 PostgreSQL 后，在 **pgAdmin 或 psql** 中执行（把密码换成你自己的）：

```sql
CREATE ROLE cbai LOGIN PASSWORD '你自己的本地密码';
CREATE DATABASE crossborder_ai OWNER cbai;
```

---

## 3. 三条命令跑起来

```bash
# 1. 进入项目目录并安装依赖（版本已锁定）
cd crossborder-ai-workspace
npm ci

# 2. 配置环境变量 + 建表 + 可选的开发种子数据
cp .env.example .env.local       # Windows PowerShell: copy .env.example .env.local
#    编辑 .env.local，把 DATABASE_URL 改成你自己的本地连接串
npm run db:migrate
npm run db:check                 # 应输出 PASS
npm run db:seed                  # 可选：写入明确标注 [示例] 的开发种子

# 3. 启动
npm run dev                      # 打开 http://localhost:3000
```

`DATABASE_URL` 格式：`postgresql://cbai:你的密码@127.0.0.1:5432/crossborder_ai`

如果数据库没配好，首页不会崩溃，也不会伪造数据 —— 它会显示**空状态 + 明确的红色配置提示**。

---

## 4. 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本地开发（`http://localhost:3000`） |
| `npm run build` | 生产构建（Turbopack） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm test` | Vitest 单元 + 集成测试（需数据库已连通） |
| `npm run db:generate` | 修改 schema 后生成迁移文件（**必须提交 Git**） |
| `npm run db:migrate` | 应用迁移 |
| `npm run db:check` | 连接、表结构、行数检查 |
| `npm run db:backup` | 生成 `storage/backups/*.dump` |
| `npm run db:restore -- <文件>` | 恢复（覆盖数据，需交互确认） |

健康检查：`curl http://localhost:3000/api/v1/health`

---

## 5. 目录结构（按文档 3 建立，空目录随 Sprint 逐步填充）

```
src/
├── app/                     # 页面与 /api/v1/ 路由
│   ├── page.tsx             # 综合首页（真实数据）
│   ├── [section]/page.tsx   # 模块页：真实数据 or 规划中占位
│   └── api/v1/              # projects / tasks / audit-logs / approvals / agents / health
├── components/              # layout / dashboard / ui（含内联 SVG 图标库）
├── modules/                 # 业务模块目录（Sprint 3+ 逐步填充）
├── server/                  # services / permissions / audit / ai(providers, agents, tools)
├── db/                      # schema / migrations / seed
├── lib/                     # config / validation / errors / utils
└── types/
docs/                        # 01–10 设计文档 + 验收报告
storage/                     # uploads / reports / backups
scripts/                     # db-check / seed / backup / restore
tests/                       # unit / integration / e2e
```

分层方向：**页面 → 组件 → 服务 → 数据访问**，下层不得 import 上层。

---

## 6. 数据库规则（文档 4.4）

1. 所有表结构变化必须通过 `npm run db:generate` 生成迁移文件，并纳入 Git。
2. 金额字段一律 `numeric(18,4)`，禁止用浮点数存货币。
3. 所有重要数据带 `id / created_at / updated_at / user_id / status / data_type`。
4. `data_type` 是数据库枚举：**R 真实 / E 估算 / P 预测 / S 模拟 / U 用户输入**。
5. 删除数据前必须有审批；归档项目受 `requireApproval()` 闸门保护。
6. 备份必须实际恢复验证过（`docs/ACCEPTANCE-SPRINT-1.md` 有演练记录）。

---

## 7. 安全与成本（文档 9 / 12）

- `.env.local` 已被 `.gitignore` 排除，**真实密钥绝不进源码或 Git**。
- `AI_PROVIDER=none` 为默认：不调用任何模型、不产生费用。首页明确显示「AI 未配置」。
- `AI_PROVIDER=mock` 的输出强制带「模拟输出 · 非真实 AI」，不可作为研究结论。
- 外部/付费模型适配器**未实现**；尝试启用会返回 403 并提示需人工批准。
- 上传、导出、外部网页内容在后续 Sprint 一律按不可信数据处理。
- 第一阶段**仅本机或受控网络运行**，未完成认证与安全检查前禁止暴露到公网。
- 未安装/未配置任何付费软件、云服务或 AI API。

---

## 8. 验收对照

逐条结论与真实命令输出见 `docs/ACCEPTANCE-SPRINT-1.md`（F-01 ~ F-16）。
未通过项明确标注「未完成」，不伪造测试结果。

---

## 9. 下一步（需人工审批后才继续）

**Sprint 2 / 3**：补齐文档 4.2 的其余数据表（按迁移文件分批）、完整项目管理与任务管理、
文件元数据、首页汇总扩展。前端第一版已交付，**请确认方向后再往下做**。

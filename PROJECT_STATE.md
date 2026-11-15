# 项目状态

> 最后更新：2026-11-15 · 第二阶段交付（V2 视觉与范围重做）

## 当前阶段

Sprint 1 骨架 + V2 重做已完成并通过验证。**19 个模块全部可增删改查**，数据落本机 PostgreSQL。

## 已完成（带产物）

| 项 | 产物路径 |
|---|---|
| 工程骨架（Next.js 16 + TS + Tailwind 4） | `package.json`、`tsconfig.json`、`next.config.ts` |
| 数据模型 39 张表 / 7 个域文件 | `src/db/schema/*.ts` |
| 3 个迁移（全部已应用并进 Git） | `src/db/migrations/0000..0002` |
| 通用 CRUD 内核 | `src/modules/store.ts` |
| 19 份模块定义 | `src/modules/defs/*.ts` |
| 通用模块页 | `src/app/[section]/page.tsx` |
| 三套配色 + 版式系统 | `src/app/globals.css`、`src/lib/config/theme*.ts` |
| 首页三段式（对话→结果→沉淀） | `src/app/page.tsx` |
| AI 总管家（规则模板拆解） | `src/server/ai/orchestrator/planner.ts`、`src/app/api/v1/assistant/plan/route.ts` |
| 财务计算（口径可复现） | `src/server/services/dashboard.ts`、`src/components/modules/finance-result.tsx` |
| 权限与审批闸门 | `src/server/permissions/policy.ts` |
| 审计日志 | `src/server/audit/logger.ts` |
| 备份/恢复演练脚本 | `scripts/backup.sh`、`scripts/restore.sh` |
| 演示数据（可一键清除） | `scripts/demo.ts` |
| 三套配色对比图 | `.design/theme-compare.png` |

## 验证结果（真跑，非声称）

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 退出码 0 |
| `npm test` | 35 / 35 通过 |
| `npm run build` | 退出码 0，13 条路由全部按需渲染 |
| 19 个模块页 | 全部 HTTP 200 |
| 通用 CRUD | 201 创建 / 200 读取 / 200 修改 / 403 删除需审批 / 422 校验 / 404 未知模块 |
| 财务口径 | 19.9 档 → 成本 17.06、净利 2.84、回本 1058 单；25 档 → 成本 19.48、回本 362 单 |
| 目标拆解 | 3 个匹配环节 + 补齐至 4 步，合规环节标「人工执行」 |
| 三档视口 | 1440 / 375 均 0 横向溢出，标题不断行 |
| 备份恢复 | 恢复到独立临时库，数据行数一致 |

## 待决策

| 项 | 选项 | 推荐 |
|---|---|---|
| 配色定稿 | 深色专业 / 浅色琥珀 / 浅色靛蓝 / 混用（深色 + 浅色各留一套） | **深色专业**（信息密度与工具感最匹配工作台） |
| 是否接入真实模型 | 继续 `none` / 启用 `mock` / 接付费 API | **继续 none**，等明确预算再谈 |
| 文件上传 | 保持元数据 / 补拖拽上传 | Sprint 3 补 |

## 下一步（≤3）

1. 定配色 → 把其余页面的零散色值全部收敛到主题变量（当前已全走变量，只需验证）
2. 财务模拟补「不同售价情景对比」（同一方案多组售价并排算）
3. 工作流中心补执行引擎：把定义真正跑起来并写 `workflow_runs`

## 已知风险

- 无登录认证：只可本机/受控网络使用，**禁止暴露公网**
- 文件中心只登记元数据，原件需自行归档
- AI 未接入，所有拆解来自规则模板，已在 UI 显式标注
- Windows 实机未验证（当前在 Linux 沙箱完成构建与运行验证，Windows 步骤见 README 第 3 节）

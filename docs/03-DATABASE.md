# 03 · 数据库设计

> 来源：文档第 4 节。当前只建「打通一条流程」所需 4 张表，其余按 Sprint 逐批迁移加入。

## 1. 已建表（迁移 `0000_curvy_fenris.sql`）

| 表 | 字段要点 | 索引 | 外键 |
|---|---|---|---|
| `users` | id, display_name, email, created_at, updated_at | — | — |
| `projects` | id, user_id, name, description, status, progress, data_type, 时间戳 | 2 | → users |
| `tasks` | id, user_id, project_id, title, status, priority, source, data_type, 时间戳 | 2 | → users, projects |
| `audit_logs` | id, user_id, action, entity_type, entity_id, permission_level, detail(jsonb), created_at | 2 | → users |

枚举：`data_type(R/E/P/S/U)`、`project_status`、`task_status`、`permission_level(L1–L4)`。

所有表均满足文档 4.1：`id / created_at / updated_at / user_id / status / 必要的来源信息`。

## 2. 后续批次表清单（文档 4.2，尚未建）

**用户与系统**：user_preferences, system_settings
**项目与任务**：task_dependencies, task_logs, project_milestones
**Agent 与工作流**：agents, agent_runs, agent_messages, workflows, workflow_runs, approvals, tool_registry
**市场与产品**：research_projects, research_sources, research_findings, platforms, products, competitors, suppliers
**财务**：finance_scenarios, product_costs, currency_rates, profit_calculations
**学习成长**：courses, lessons, learning_plans, learning_records, assessments, growth_profiles
**知识文件**：knowledge_items, files, file_chunks, reports, citations

> 每批都必须 `npm run db:generate` 生成迁移文件并纳入 Git，禁止直接改正式库结构。

## 3. 数据类型标准（文档 4.3）

`R 真实 / E 估算 / P 预测 / S 模拟 / U 用户输入`，已作为 PostgreSQL 枚举落地。
所有研究结论必须尽可能关联来源；模拟数据不得标成真实数据。

## 4. 十条数据库纪律（文档 4.4）

1. 不直接改正式库结构 → 全部走迁移文件
2. 迁移文件纳入 Git
3. 删除数据前必须有保护机制
4. 重要表建必要索引 ✅ 已建 5 个
5. 外键明确 ✅ 已建 4 个
6. **金额用 `numeric(18,4)`，禁止浮点存货币**（财务表 S5 落地时执行）
7. 历史汇率保留
8. 数据库结构必须经过测试 ✅ 集成测试覆盖
9. 备份恢复必须实际验证 → 见验收报告 F-15
10. 本地单用户也预留 `user_id` ✅

## 5. 备份与恢复

```bash
npm run db:backup                          # pg_dump -Fc → storage/backups/*.dump
npm run db:restore -- <文件>                # 需交互输入 yes
RESTORE_DATABASE_URL=<临时库> ASSUME_YES=1 npm run db:restore -- <文件>   # 演练
```

恢复是破坏性操作，脚本默认要求人工确认；演练一律恢复到临时库，不动主库。

## 6. 迁移 0003 新增字段（2026-11-15）

只加列、不删不改，老数据行为完全不变。

| 表 | 新列 | 用途 |
|---|---|---|
| `finance_scenarios` | `cost_currency` | 空字符串 = 与售价币种相同；老数据因此不需要回填 |
| `finance_scenarios` | `fx_rate` / `fx_as_of` / `fx_source` | 方案锁定的汇率快照；`fx_rate = 0` 表示未锁定，按当前汇率试算 |
| `files` | `extract_status` / `extract_error` / `extracted_at` / `char_count` | 解析状态、失败原因、时间与字数；只看「有没有 chunk」分不清「没点过」和「每次都失败」 |

`currency_rates` 与 `file_chunks` 两张表在 0001 已建，**0003 只接上服务与界面**，没有新增表。
汇率只追加不覆盖；反向汇率按 `1/r` 在内存推算，不写库。文件索引可重建：每次先删旧块，不产生重复。

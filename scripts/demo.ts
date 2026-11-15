import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * 演示数据（可选，默认不执行）。
 *
 * 用途：让首页、驾驶舱与各模块有可看的真实记录，便于判断视觉与信息密度。
 * 约束：
 * 1. 每一条的名称/标题都以「[演示]」开头，一眼可辨
 * 2. 全部 data_type = 'U'（用户输入），不冒充真实采集数据
 * 3. 平台费率是录入时的参考值，标 E（估算），以平台官方文档为准
 * 4. `npm run db:demo:clear` 可一次性删除，不留残留
 */
const TAG = "[演示]";

async function clear(sql: postgres.Sql): Promise<void> {
  const like = `${TAG}%`;
  // 先删子表，避免外键阻塞
  await sql`delete from competitors where name like ${like}`;
  await sql`delete from product_costs where note like ${like}`;
  await sql`delete from profit_calculations where assumption like ${like}`;
  await sql`delete from finance_scenarios where name like ${like}`;
  await sql`delete from research_findings where statement like ${like}`;
  await sql`delete from research_sources where title like ${like}`;
  await sql`delete from citations where source_title like ${like}`;
  await sql`delete from reports where title like ${like}`;
  await sql`delete from knowledge_items where title like ${like}`;
  await sql`delete from task_logs where message like ${like}`;
  await sql`delete from tasks where title like ${like}`;
  await sql`delete from project_milestones where title like ${like}`;
  await sql`delete from projects where name like ${like}`;
  await sql`delete from learning_records where note like ${like}`;
  await sql`delete from learning_plans where title like ${like}`;
  await sql`delete from products where name like ${like}`;
  await sql`delete from suppliers where name like ${like}`;
  await sql`delete from platforms where name like ${like}`;
  console.log("[demo] 演示数据已清除");
}

async function seed(sql: postgres.Sql, userId: string): Promise<void> {
  const existing = await sql`select count(*)::int as n from projects where name like ${`${TAG}%`}`;
  if (existing[0].n > 0) {
    console.log("[demo] 已存在演示数据，先执行 npm run db:demo:clear 再重新生成");
    return;
  }

  const [project] = await sql`
    insert into projects (user_id, name, description, status, progress, goal, data_type)
    values (${userId}, ${`${TAG} 北美宠物零食店 · 可行性验证`},
      ${"先验证一个单品能不能在 3 个月内跑正毛利，再决定是否备货。"},
      ${"active"}, ${45}, ${"美国站首选，测试 19.9–24.9 美元价格带"}, ${"U"})
    returning id`;

  const projectId = project.id as string;

  await sql`
    insert into tasks (user_id, project_id, title, detail, status, priority, source, agent_slug, data_type)
    values
      (${userId}, ${projectId}, ${`${TAG} 市场研究：美国宠物零食规模与价格带`},
        ${"确认需求量与主流价格带，每条结论附来源"}, ${"done"}, ${1}, ${"assistant"}, ${"market-analyst"}, ${"U"}),
      (${userId}, ${projectId}, ${`${TAG} 平台比较：Amazon 与 TikTok Shop 佣金结构`},
        ${"对比佣金、履约方式、新品扶持"}, ${"running"}, ${1}, ${"assistant"}, ${"platform-analyst"}, ${"U"}),
      (${userId}, ${projectId}, ${`${TAG} 选品研究：拆解 3 个头部竞品`},
        ${"看定价、评价数、差评集中点"}, ${"pending"}, ${1}, ${"assistant"}, ${"product-researcher"}, ${"U"}),
      (${userId}, ${projectId}, ${`${TAG} 找 3 家冻干零食供应商询价`},
        ${"记录起订量、单价、交期；当前无对应 Agent，人工执行"}, ${"pending"}, ${2}, ${"user"}, ${null}, ${"U"}),
      (${userId}, ${projectId}, ${`${TAG} 财务模拟：19.9 美元档能否盈利`},
        ${"按采购+头程+佣金+广告逐项核算"}, ${"review"}, ${1}, ${"assistant"}, ${"finance-analyst"}, ${"U"})`;

  await sql`
    insert into finance_scenarios (user_id, name, currency, sell_price, purchase_cost, shipping_cost,
      commission_rate, payment_rate, ad_cost, other_cost, fixed_cost, expected_orders, assumption, data_type)
    values (${userId}, ${`${TAG} 冻干鸡胸肉零食 · 19.9 美元档`}, ${"USD"}, ${"19.9000"}, ${"6.2000"},
      ${"3.8000"}, ${"15.0000"}, ${"2.9000"}, ${"2.5000"}, ${"1.0000"}, ${"3000.0000"}, ${600},
      ${"售价 19.9 / 采购 6.2 / 运费 3.8 / 广告 2.5 / 其他 1.0 / 佣金 15% / 支付 2.9% / 固定投入 3000（商标+检测）"}, ${"U"})`;

  await sql`
    insert into learning_plans (user_id, title, goal, weekly_hours, status, progress, data_type)
    values
      (${userId}, ${`${TAG} 4 周搞懂美国宠物食品合规`},
        ${"能独立判断一个品类是否需要 FDA 设施注册与标签合规"}, ${6}, ${"active"}, ${35}, ${"U"}),
      (${userId}, ${`${TAG} 2 周摸清 Amazon 广告结构`},
        ${"能自己搭一组 SP 广告并读懂 ACOS"}, ${5}, ${"active"}, ${10}, ${"U"})`;

  await sql`
    insert into platforms (user_id, name, region, category, commission_rate, entry_cost,
      requirements, pros, cons, score, data_type)
    values
      (${userId}, ${`${TAG} Amazon US`}, ${"北美"}, ${"综合"}, ${"15.0000"}, ${"0"},
        ${"营业执照、品牌备案（部分品类）"}, ${"流量大、履约成熟"}, ${"竞争激烈、广告成本高"}, ${82}, ${"E"}),
      (${userId}, ${`${TAG} TikTok Shop US`}, ${"北美"}, ${"内容电商"}, ${"6.0000"}, ${"0"},
        ${"企业资质、内容运营能力"}, ${"新品起量快、内容红利"}, ${"退货率高、达人依赖强"}, ${74}, ${"E"}),
      (${userId}, ${`${TAG} Shopify 独立站`}, ${"全球"}, ${"自建站"}, ${"0.0000"}, ${"29"},
        ${"自建站能力、广告投放能力"}, ${"数据自主、复购可控"}, ${"无自然流量，全靠投放"}, ${61}, ${"E"})`;

  await sql`
    insert into products (user_id, name, category, target_market, purchase_price, sell_price,
      currency, monthly_demand, competition_level, score, notes, data_type)
    values
      (${userId}, ${`${TAG} 冻干鸡胸肉零食 100g`}, ${"宠物零食"}, ${"美国"}, ${"6.2000"}, ${"19.9000"},
        ${"USD"}, ${4200}, ${"medium"}, ${78}, ${"复购型品类，需注意保质期与标签"}, ${"U"}),
      (${userId}, ${`${TAG} 宠物慢食碗`}, ${"宠物用品"}, ${"美国"}, ${"4.1000"}, ${"16.9000"},
        ${"USD"}, ${1800}, ${"high"}, ${64}, ${"体积大，头程成本高"}, ${"U"})`;

  await sql`
    insert into suppliers (user_id, name, product_category, contact, location, min_order_qty,
      unit_price, lead_time_days, shipping_method, shipping_cost, rating, notes, data_type)
    values (${userId}, ${`${TAG} 山东某宠物食品厂`}, ${"宠物零食"}, ${"询价中"}, ${"山东潍坊"},
      ${2000}, ${"6.2000"}, ${25}, ${"海运拼箱"}, ${"3.8000"}, ${72}, ${"需确认 FDA 设施注册情况"}, ${"U"})`;

  await sql`
    insert into reports (user_id, title, kind, summary, body, status, data_type)
    values (${userId}, ${`${TAG} 美国宠物零食市场进入可行性报告`}, ${"research"},
      ${"19.9 美元档扣除佣金与广告后单件净利 2.84 美元，需累计约 1058 单才能覆盖 3000 美元固定投入。"},
      ${"## 结论\n\n1. 需求真实存在，但头部集中度高\n2. 差异化机会在配方与包装\n3. 现金流压力主要来自 2000 件起订\n\n（演示报告，结论未经验证，不可直接用于决策）"},
      ${"draft"}, ${"U"})`;

  await sql`
    insert into knowledge_items (user_id, title, body, category, tags, source_type, data_type)
    values
      (${userId}, ${`${TAG} 美国宠物食品需 FDA 设施注册`},
        ${"向美国出口宠物食品，生产设施需在 FDA 注册；标签需符合 AAFCO 格式。具体以官方最新要求为准。"},
        ${"合规"}, ${"FDA,宠物食品,美国"}, ${"manual"}, ${"U"}),
      (${userId}, ${`${TAG} 亚马逊新品前 30 天权重最高`},
        ${"新品期的转化率与评价积累对后续自然流量影响最大，前 30 天不宜压价换量过快。"},
        ${"平台规则"}, ${"Amazon,新品期"}, ${"research"}, ${"U"})`;

  console.log("[demo] 已写入：1 项目 / 5 任务 / 1 财务方案 / 2 学习计划 / 3 平台 / 2 产品 / 1 供应商 / 1 报告 / 2 知识");
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[demo] FAIL: DATABASE_URL 未配置");
    process.exitCode = 1;
    return;
  }
  const userId = process.env.APP_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  const shouldClear = process.argv.includes("--clear");
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    if (shouldClear) {
      await clear(sql);
      return;
    }
    await sql`insert into users (id, display_name) values (${userId}, ${"本地用户"}) on conflict (id) do nothing`;
    await seed(sql, userId);
  } catch (error) {
    console.error("[demo] FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

void main();

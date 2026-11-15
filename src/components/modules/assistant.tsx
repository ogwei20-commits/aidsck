import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMessages } from "@/db/schema";
import { formatDateTime } from "@/lib/utils/format";
import { getProviderStatus } from "@/server/ai/providers";
import { AGENT_REGISTRY } from "@/server/ai/agents/registry";
import { listProjects } from "@/server/services/workspace";
import { PlannerForm } from "./assistant-client";

type HistoryRow = { id: string; role: string; content: string; createdAt: Date };

export async function AssistantWorkspace({ userId }: { userId: string }) {
  const provider = getProviderStatus();

  let history: HistoryRow[] = [];
  let projectOptions: { value: string; label: string }[] = [];
  let dbError: string | null = null;

  try {
    const db = getDb();
    history = (await db.select().from(agentMessages).orderBy(desc(agentMessages.createdAt)).limit(12)) as HistoryRow[];
    projectOptions = (await listProjects(userId, 50)).map((p) => ({ value: p.id, label: p.name }));
  } catch (error) {
    dbError = error instanceof Error ? error.message : "数据库读取失败";
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head-main">
          <div className="eyebrow">总览 / AI 总管家</div>
          <h1>把一个想法拆成能执行的事</h1>
          <p>
            你说清目标，系统按跨境电商的研究流程拆成具体任务，直接落到任务中心。
            当前拆解基于内置流程模板，不是模型推理——这一点会写在每次结果里，不混淆。
          </p>
        </div>
        <div className="page-head-side">
          <div className="capability-card">
            <div className="cap-row">
              <span>模型</span>
              <strong className={provider.isReal ? "tone-ok" : "tone-warn"}>{provider.label}</strong>
            </div>
            <div className="cap-row">
              <span>拆解方式</span>
              <strong>内置流程模板</strong>
            </div>
            <div className="cap-row">
              <span>已注册角色</span>
              <strong>{AGENT_REGISTRY.length} 个</strong>
            </div>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="status-banner is-error">
          <strong>数据库未连通。</strong> {dbError} 配置 .env.local 后执行 npm run db:migrate。
        </div>
      )}

      <section className="section">
        <PlannerForm projectOptions={projectOptions} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">01 /</span>可控边界</h2>
          <p>这些限制写在代码里，不是写在文档里</p>
        </div>
        <div className="notice-grid">
          <div className="notice">
            <h4>不冒充模型输出</h4>
            <p>每次拆解结果都标注「内置流程模板」。接入真实模型前，系统不会声称任何输出是 AI 生成的。</p>
          </div>
          <div className="notice">
            <h4>不自行提权</h4>
            <p>拆出的任务最多是 L2（生成草稿/计算）。需要对外发送或花钱的动作，必须走安全中心人工审批。</p>
          </div>
          <div className="notice is-warn">
            <h4>缺角色的环节会标明</h4>
            <p>供应链、合规目前没有对应 Agent，相关任务会直接标「需人工执行」，而不是假装有人在跑。</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">02 /</span>最近拆解记录</h2>
          <p>来自 agent_messages 表 · 共 {history.length} 条</p>
        </div>
        {history.length === 0 ? (
          <div className="empty-block">
            <p className="empty-title">还没有拆解记录</p>
            <p className="empty-hint">在上面写一句你想做的事，系统会把它拆成任务并在这里留痕。</p>
          </div>
        ) : (
          <ul className="msg-list">
            {history.map((m) => (
              <li key={m.id} className={m.role === "user" ? "is-user" : "is-assistant"}>
                <div className="msg-head">
                  <span>{m.role === "user" ? "你" : "系统拆解"}</span>
                  <time>{formatDateTime(m.createdAt)}</time>
                </div>
                <p>{m.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

import { countRows } from "@/modules/store";
import { MODULES } from "@/modules/registry";
import { listAuditLogs } from "@/server/services/workspace";
import { formatDateTime } from "@/lib/utils/format";

const DATA_TYPES = [
  { code: "R", label: "真实数据", hint: "有可核验来源，可直接用于决策" },
  { code: "E", label: "估算数据", hint: "基于已知数据推算，误差需标注" },
  { code: "P", label: "预测数据", hint: "面向未来，必须写清假设" },
  { code: "S", label: "模拟数据", hint: "用于测试，不得当作结论" },
  { code: "U", label: "用户输入", hint: "你自己填的，未经验证" },
];

export async function LineageView({ userId }: { userId: string }) {
  let counts: { slug: string; label: string; group: string; n: number }[] = [];
  let logs: Awaited<ReturnType<typeof listAuditLogs>> = [];
  let dbError: string | null = null;

  try {
    counts = await Promise.all(
      MODULES.map(async (def) => ({
        slug: def.slug,
        label: def.label,
        group: def.group,
        n: await countRows(def, userId),
      })),
    );
    logs = await listAuditLogs(200);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "数据库读取失败";
  }

  const total = counts.reduce((sum, c) => sum + c.n, 0);

  return (
    <>
      <header className="page-head">
        <div className="page-head-main">
          <div className="eyebrow">沉淀与治理 / 数据溯源</div>
          <h1>每条数据都要能说清从哪来</h1>
          <p>
            这里能看到每个模块存了多少条、每条数据的可信度类型，以及谁在什么时候改过什么。
            没有来源的结论，不应该进入决策。
          </p>
        </div>
        <div className="page-head-side">
          <div className="count-block">
            <span className="count-value">{total}</span>
            <span className="count-label">条业务数据</span>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="status-banner is-error">
          <strong>数据库未连通。</strong> {dbError}
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">01 /</span>数据类型标准</h2>
          <p>文档 4.3 · 结论必须标明属于哪一类</p>
        </div>
        <div className="dtype-row">
          {DATA_TYPES.map((t) => (
            <div key={t.code} className="dtype-card">
              <span className="dtype-code">{t.code}</span>
              <div>
                <strong>{t.label}</strong>
                <p>{t.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">02 /</span>各模块数据量</h2>
          <p>15 个可写模块 · 真实表计数</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>模块</th><th>分组</th><th>记录数</th><th>表</th></tr>
            </thead>
            <tbody>
              {counts.map((c) => {
                const def = MODULES.find((m) => m.slug === c.slug);
                return (
                  <tr key={c.slug}>
                    <td>{c.label}</td>
                    <td><span className="badge">{c.group}</span></td>
                    <td className="mono">{c.n}</td>
                    <td className="mono">{def?.table}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2><span className="section-index">03 /</span>变更留痕</h2>
          <p>audit_logs · 最近 {logs.length} 条</p>
        </div>
        {logs.length === 0 ? (
          <div className="empty-block">
            <p className="empty-title">还没有操作记录</p>
            <p className="empty-hint">任何创建、修改、审批都会自动写进审计日志，不需要手动记。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>时间</th><th>动作</th><th>对象</th><th>级别</th><th>详情</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="mono">{formatDateTime(log.createdAt)}</td>
                    <td><span className="badge tone-accent">{log.action}</span></td>
                    <td>{log.entityType}{log.entityId ? ` / ${log.entityId.slice(0, 8)}` : ""}</td>
                    <td className="mono">{log.permissionLevel}</td>
                    <td className="mono cell-clip">{JSON.stringify(log.detail).slice(0, 90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

import { NAV_GROUPS, NAV_ITEMS } from "@/lib/config/navigation";
import { DATA_TYPE_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, formatDateTime } from "@/lib/utils/format";
import type { AuditLogRow, ProjectRow, TaskRow } from "@/db/schema";
import type { DataType, ProjectStatus, TaskStatus } from "@/types";
import type { ProviderStatus } from "@/server/ai/providers";
import { ProjectComposer } from "./quick-create";

export function ProjectPanel({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>当前项目</h3>
        <span className="hint">实时读取 · 最近 5 条</span>
      </div>
      {projects.length === 0 ? (
        <p className="empty">
          <strong>还没有项目。</strong>用下方输入框创建第一个，数据会立刻写入本机数据库。
        </p>
      ) : (
        <ul className="list">
          {projects.map((p) => (
            <li className="list-row" key={p.id}>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-meta">
                  {formatDateTime(p.updatedAt)} 更新 · <span className="badge is-data">{p.dataType} {DATA_TYPE_LABEL[p.dataType as DataType]}</span>
                </div>
                <div className="progress" aria-label={`进度 ${p.progress}%`}>
                  <span style={{ width: `${p.progress}%` }} />
                </div>
              </div>
              <div className="row-side">
                <span className={`badge${p.status === "active" ? " is-active" : ""}`}>
                  {PROJECT_STATUS_LABEL[p.status as ProjectStatus]}
                </span>
                <div style={{ marginTop: 6 }}>{p.progress}%</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ProjectComposer />
    </div>
  );
}

export function TaskPanel({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div className="panel is-tinted">
      <div className="panel-head">
        <h3>今日任务</h3>
        <span className="hint">实时读取 · 最近 8 条</span>
      </div>
      {tasks.length === 0 ? (
        <p className="empty">
          <strong>暂无任务。</strong>在首屏输入框写下一个目标，它会真实落库并出现在这里。
        </p>
      ) : (
        <ul className="list">
          {tasks.map((t) => (
            <li className="list-row" key={t.id}>
              <div className="row-main">
                <div className="row-title">{t.title}</div>
                <div className="row-meta">
                  {formatDateTime(t.createdAt)} · 来源 {t.source} · <span className="badge is-data">{t.dataType}</span>
                </div>
              </div>
              <div className="row-side">
                <span className={`badge${t.status === "running" ? " is-active" : ""}`}>
                  {TASK_STATUS_LABEL[t.status as TaskStatus]}
                </span>
                <div style={{ marginTop: 6 }}>P{t.priority}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuditTable({ logs }: { logs: AuditLogRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>时间</th><th>动作</th><th>对象</th><th>权限</th><th>详情</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={5} className="empty">尚无操作日志。创建项目或任务后会自动记录。</td></tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td className="mono">{formatDateTime(log.createdAt)}</td>
                <td><span className="badge">{log.action}</span></td>
                <td>{log.entityType}<span className="row-meta"> · {log.entityId?.slice(0, 8) ?? "—"}</span></td>
                <td className="mono">{log.permissionLevel}</td>
                <td className="mono">{JSON.stringify(log.detail).slice(0, 90)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function RiskNotices({ ai, dbError }: { ai: ProviderStatus; dbError: string | null }) {
  return (
    <div className="notices">
      <div className="notice">
        <span style={{ color: "var(--info)", flex: "none", marginTop: 2 }}>●</span>
        <div>
          <h4>{ai.label}（不产生费用）</h4>
          <p>{ai.notice}</p>
        </div>
      </div>
      <div className="notice is-warn">
        <span style={{ color: "var(--warn)", flex: "none", marginTop: 2 }}>●</span>
        <div>
          <h4>规划中模块不可使用</h4>
          <p>
            导航中标「规划中」的模块只有占位页。真实店铺管理、订单库存同步、自动发布、广告投放、
            SaaS 多租户等均不在第一阶段范围。{dbError ? " 当前数据库未连通，请按下方提示配置。" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ModuleRoadmap() {
  return (
    <div className="roadmap">
      {NAV_GROUPS.map((group) => (
        <div className="roadmap-group" key={group}>
          <h3>{group}</h3>
          {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
            <div className="roadmap-row" key={item.slug}>
              <span className="rm-name">{item.label}</span>
              <span className={`badge${item.status === "planned" ? " is-planned" : item.status === "partial" ? " is-warn" : " is-active"}`}>
                {item.status === "ready" ? "已可用" : item.status === "partial" ? "最小版" : "规划中"}
              </span>
              <span className="rm-sprint">{item.sprint}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 有信息的内联示意图：文档 4.3 的 R/E/P/S/U 数据类型，不用灰块占位 */
export function DataTypeLegend() {
  const items: { k: DataType; label: string; note: string }[] = [
    { k: "R", label: "真实", note: "可核验来源" },
    { k: "E", label: "估算", note: "标明假设" },
    { k: "P", label: "预测", note: "含时间范围" },
    { k: "S", label: "模拟", note: "情景推演" },
    { k: "U", label: "用户", note: "本人录入" },
  ];
  return (
    <div className="quote-block">
      <div>
        <div className="quote-tag">DATA PROVENANCE / 文档 4.3</div>
        <h2>每一条结论，都要说清它是从哪里来的</h2>
        <p>
          第一阶段就把「数据类型」写进数据库字段：R 真实、E 估算、P 预测、S 模拟、U 用户输入。
          研究结论必须关联来源；模拟数据永远不会被标成真实数据。当前项目与任务默认标记为 U。
        </p>
      </div>
      <svg className="legend-svg" viewBox="0 0 460 140" role="img" aria-label="R E P S U 五种数据类型示意">
        <line x1="8" y1="118" x2="452" y2="118" stroke="#3b444c" strokeWidth="1" />
        {items.map((it, i) => {
          const x = 8 + i * 90;
          const h = 62 - i * 9;
          return (
            <g key={it.k}>
              <rect x={x} y={112 - h} width="76" height={h} fill={i === 0 ? "#0b6e7a" : "#2b343c"} rx="2" />
              <text x={x + 10} y={112 - h + 26} fill="#ffffff" fontSize="20" fontFamily="monospace" fontWeight="600">{it.k}</text>
              <text x={x + 10} y={112 - h + 44} fill="#c9d2d8" fontSize="10">{it.label}</text>
              <text x={x} y="134" fill="#8fb8bd" fontSize="9">{it.note}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

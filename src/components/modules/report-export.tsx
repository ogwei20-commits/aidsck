import type { Row } from "@/modules/store";
import { REPORT_KIND_LABEL, REPORT_STATUS_LABEL } from "@/server/services/reports";
import { formatDateTime } from "@/lib/utils/format";

/**
 * 报告导出入口。
 *
 * 放在列表下方而不是塞进行内按钮：导出是「带走一份成品」的动作，
 * 和改状态、删记录不是一类操作，混在同一列里会被误点。
 * 两个入口的差别要说清楚，否则用户不知道该点哪个。
 */
export function ReportExport({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="export-wrap">
      <div className="export-legend">
        <div>
          <strong>Markdown（.md）</strong>
          <span>带附录与来源清单的纯文本，能进版本库、能被别的工具读</span>
        </div>
        <div>
          <strong>可打印页面（PDF）</strong>
          <span>打开后按 Ctrl+P / ⌘P 存为 PDF，矢量排版、中文不丢字</span>
        </div>
      </div>

      <ul className="export-list">
        {rows.map((row) => {
          const id = String(row.id ?? "");
          const title = String(row.title ?? "未命名报告");
          const status = String(row.status ?? "");
          const kind = String(row.kind ?? "");
          const body = String(row.body ?? "");
          const empty = body.trim().length === 0;
          const updated = row.updatedAt ? formatDateTime(String(row.updatedAt)) : "";

          return (
            <li key={id} className="export-item">
              <div className="export-main">
                <span className="export-title">{title}</span>
                <span className="export-meta">
                  {REPORT_KIND_LABEL[kind] ?? kind}
                  {status ? ` · ${REPORT_STATUS_LABEL[status] ?? status}` : ""}
                  {updated ? ` · ${updated}` : ""}
                  {empty ? " · 正文为空" : ` · ${body.length} 字`}
                </span>
              </div>
              <div className="export-actions">
                <a className="btn-mini" href={`/api/v1/reports/${id}/export?format=md`}>
                  下载 .md
                </a>
                <a
                  className="btn-mini"
                  href={`/api/v1/reports/${id}/export?format=html`}
                  target="_blank"
                  rel="noreferrer"
                >
                  打印 / PDF
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

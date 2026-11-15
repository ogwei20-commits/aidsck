import { formatDateTime } from "@/lib/utils/format";
import type { ListColumn, ModuleDef } from "@/modules/types";
import { RowActions } from "./module-client";

type Row = Record<string, unknown>;

const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 });

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function renderCell(col: ListColumn, row: Row) {
  const raw = row[col.name];

  if (col.kind === "badge") {
    const option = col.options?.find((o) => o.value === String(raw));
    if (!option) return <span className="badge">{String(raw ?? "—")}</span>;
    return <span className={`badge tone-${option.tone ?? "muted"}`}>{option.label}</span>;
  }

  if (col.kind === "progress") {
    const pct = Math.min(100, Math.max(0, asNumber(raw)));
    return (
      <div className="cell-progress">
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        <em>{pct}%</em>
      </div>
    );
  }

  if (col.kind === "money") {
    const currency = String(row.currency ?? "");
    return <span className="mono">{numberFormat.format(asNumber(raw))}{currency ? ` ${currency}` : ""}</span>;
  }

  if (col.kind === "mono") {
    if (col.name.endsWith("At") && raw) return <span className="mono">{formatDateTime(String(raw))}</span>;
    // numeric 列会带出 8 位小数（如 15.00000000），去掉无意义的尾随零
    if (typeof raw === "number" || (typeof raw === "string" && /^-?\d+\.\d+$/.test(raw))) {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        return <span className="mono">{n.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}</span>;
      }
    }
    return <span className="mono">{raw === null || raw === undefined || raw === "" ? "—" : String(raw)}</span>;
  }

  const text = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  return <span className="cell-text">{text}</span>;
}

export function ModuleTable({ def, rows }: { def: ModuleDef; rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-block">
        <p className="empty-title">这里还没有记录</p>
        <p className="empty-hint">{def.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {def.columns.map((col) => (
              <th key={col.name}>{col.label}</th>
            ))}
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              {def.columns.map((col) => (
                <td key={col.name}>{renderCell(col, row)}</td>
              ))}
              <td className="col-actions">
                <RowActions
                  def={def}
                  id={String(row.id)}
                  status={def.statusField ? String(row[def.statusField] ?? "") : ""}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModuleStats({ rows, label }: { rows: Row[]; label: string }) {
  const withStatus = rows.filter((r) => r.status !== null && r.status !== undefined);
  return (
    <p className="module-stat">
      共 <strong>{rows.length}</strong> 条{label}
      {withStatus.length > 0 && `，其中 ${withStatus.length} 条有状态流转`}
    </p>
  );
}

import { formatDateTime } from "@/lib/utils/format";

type FileRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  purpose: string;
  checksum: string;
  createdAt: Date | string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortType(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
    "text/csv": "CSV",
    "application/csv": "CSV",
    "text/markdown": "Markdown",
    "text/plain": "文本",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WebP",
    "application/zip": "ZIP",
    "application/x-zip-compressed": "ZIP",
  };
  return map[mime] ?? mime;
}

export function FileTable({ rows }: { rows: FileRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-block">
        <p className="empty-title">还没有上传过文件</p>
        <p className="empty-hint">
          供应商报价单、平台费率截图、竞品评论导出——这些原始材料放在这里，后面写报告时才能追溯来源。
        </p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>文件名</th>
            <th>类型</th>
            <th>大小</th>
            <th>用途</th>
            <th>校验和</th>
            <th>上传时间</th>
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="cell-text">{row.filename}</span>
              </td>
              <td>
                <span className="badge">{shortType(row.mimeType)}</span>
              </td>
              <td>
                <span className="mono">{humanSize(row.sizeBytes)}</span>
              </td>
              <td>
                <span className="cell-text">{row.purpose || "—"}</span>
              </td>
              <td>
                <span className="mono" title={row.checksum}>
                  {row.checksum ? `${row.checksum.slice(0, 8)}…` : "—"}
                </span>
              </td>
              <td>
                <span className="mono">{formatDateTime(String(row.createdAt))}</span>
              </td>
              <td className="col-actions">
                <a className="btn-mini" href={`/api/v1/files/${row.id}/download`}>
                  下载
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

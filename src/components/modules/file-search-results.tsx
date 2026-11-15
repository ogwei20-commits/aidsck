import Link from "next/link";
import type { FileSearchResult } from "@/server/services/file-search";

/** 把命中的关键词标出来；不做 HTML 拼接，交给 React 转义，避免把文件内容当标签执行 */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const needle = q.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index >= 0) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(<mark key={index}>{text.slice(index, index + q.length)}</mark>);
    from = index + q.length;
    index = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/**
 * 全文检索结果（服务端渲染）。
 * 空结果分两种原因给不同提示：没建索引 vs 建了索引但没匹配——
 * 前者让人以为搜索坏了，必须说清下一步做什么。
 */
export function FileSearchResults({ result }: { result: FileSearchResult }) {
  if (!result.q) return null;

  if (result.fileCount === 0) {
    return (
      <div className="empty-block">
        <p className="empty-title">没有匹配「{result.q}」的文件</p>
        <p className="empty-hint">
          {result.indexedFiles === 0
            ? "目前还没有任何文件建过文本索引。点上面的「解析全部未处理文件」，或在表格里对单个文件点「提取文字」。扫描件、Excel、PPT 与图片不做解析。"
            : `已有 ${result.indexedFiles} 份文件建了索引。换个关键词，或确认目标文件是否已解析（表格里有状态）。`}
        </p>
      </div>
    );
  }

  return (
    <div className="file-hits">
      <p className="file-hits-summary">
        命中 <strong>{result.fileCount}</strong> 份文件、{result.hitCount} 个片段
        {result.fileCount > 0 && ` · 关键词「${result.q}」`}
      </p>
      {result.groups.map((group) => (
        <section className="file-hit" key={group.fileId}>
          <div className="file-hit-head">
            <Link href={`/api/v1/files/${group.fileId}/download`} className="file-hit-name">
              <Highlight text={group.filename} q={result.q} />
            </Link>
            <span className="file-hit-meta">
              {group.filenameMatch ? "文件名命中 · " : ""}
              {group.totalHits > 0 ? `${group.totalHits} 个片段` : "仅文件名命中"}
              {group.totalHits > group.chunks.length ? `（显示前 ${group.chunks.length} 个）` : ""}
            </span>
          </div>
          {group.chunks.length > 0 ? (
            <ul className="file-hit-list">
              {group.chunks.map((chunk) => (
                <li key={chunk.chunkIndex}>
                  <span className="file-hit-no">#{chunk.chunkIndex + 1}</span>
                  <blockquote>
                    <Highlight text={chunk.snippet} q={result.q} />
                  </blockquote>
                </li>
              ))}
            </ul>
          ) : (
            <p className="file-hit-none">这份文件的正文还没建索引，只有文件名匹配。</p>
          )}
        </section>
      ))}
    </div>
  );
}

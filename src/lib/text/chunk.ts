/**
 * 文本切块与检索辅助（纯函数，无依赖、无 IO）。
 *
 * 为什么不按固定字数硬切：
 * 硬切会把一句结论劈成两半，检索命中「保本单量」时片段里只有「保本单」，
 * 人也读不通。优先在句子/段落边界切，切不到再硬切。
 */

export const CHUNK_SIZE = 700;
export const CHUNK_OVERLAP = 120;
/** 单个文件最多保留多少字符的文本，防止一份几百页的 PDF 把库撑爆 */
export const MAX_EXTRACT_CHARS = 400_000;

/** 去掉 BOM、统一换行、压缩行内空白，保留段落结构 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 在 [from, to) 里找最后一个断句位置。
 * 中英文标点都认；只取窗口后半段（60% 之后），避免切出过短的碎片。
 */
function lastBoundary(text: string, from: number, to: number): number {
  const start = from + Math.floor((to - from) * 0.6);
  const window = text.slice(start, to);
  const marks = /[。！？；\n]|[.!?](?=\s|$)/g;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = marks.exec(window)) !== null) {
    last = start + m.index + m[0].length;
  }
  return last;
}

/**
 * 切成有重叠的块。重叠是为了让跨块边界的词（比如「盈亏平衡单量」
 * 正好被切开）仍能在某一块里完整出现。
 */
export function chunkText(
  raw: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const text = normalizeText(raw);
  if (!text) return [];
  if (text.length <= size) return [text];

  const step = Math.max(1, size);
  const back = Math.max(0, Math.min(overlap, step - 1));
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + step, text.length);
    if (end < text.length) {
      const boundary = lastBoundary(text, start, end);
      if (boundary > start + 1) end = boundary;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    // 必须严格大于 start，否则 overlap >= step 时会死循环
    start = Math.max(start + 1, end - back);
  }
  return chunks;
}

/** 截取命中词附近的片段，前后用省略号标明不是全文 */
export function makeSnippet(content: string, query: string, radius = 70): string {
  const text = normalizeText(content);
  const needle = query.trim();
  if (!needle) return text.slice(0, radius * 2);
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? "…" : "");

  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + needle.length + radius);
  const body = text.slice(from, to).replace(/\n+/g, " ");
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

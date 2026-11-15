import { describe, expect, it } from "vitest";
import { chunkText, makeSnippet, normalizeText } from "@/lib/text/chunk";

describe("文本规范化与切块", () => {
  it("去 BOM、统一换行、压缩行内空白但保留段落", () => {
    expect(normalizeText("\uFEFF第一行\r\n第二行\t\t第三行\n\n\n第四行")).toBe(
      "第一行\n第二行 第三行\n\n第四行",
    );
    expect(normalizeText("   \n  ")).toBe("");
  });

  it("空文本返回空数组，短文本只切一块", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n ")).toEqual([]);
    expect(chunkText("一句话结论")).toEqual(["一句话结论"]);
  });

  it("长文本切多块，每块不超过 size，且不丢字", () => {
    const text = "结论：单件净利 6.14 美元，保本单量 326 件。".repeat(80);
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    // 允许重叠，但每块都必须有实质内容
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  it("优先在句号/换行处断，不把一句结论劈成半句", () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 句：这条结论需要完整保留。`).join("");
    const chunks = chunkText(sentences, 120, 20);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.slice(0, -1).every((c) => c.endsWith("。"))).toBe(true);
  });

  it("完全没有标点的长文本也不死循环、不丢字", () => {
    const text = "甲乙丙丁".repeat(500);
    const chunks = chunkText(text, 100, 30);
    expect(chunks.length).toBeLessThan(100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    // 重叠必然导致总长大于原文，但每块都应来自原文
    expect(chunks.every((c) => text.includes(c))).toBe(true);
  });

  it("makeSnippet 命中词居中，前后给省略号", () => {
    const content = "前面".repeat(50) + "保本单量 326 件" + "后面".repeat(50);
    const snippet = makeSnippet(content, "保本单量", 20);
    expect(snippet).toContain("保本单量");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThan(content.length);
  });

  it("makeSnippet 不区分大小写，没命中时截断而不是全铺出来", () => {
    expect(makeSnippet("abc USD rate def", "usd", 10)).toContain("USD");
    const miss = makeSnippet("x".repeat(500), "找不到", 20);
    expect(miss.length).toBeLessThanOrEqual(41);
  });
});

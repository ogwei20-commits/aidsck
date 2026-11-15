import { describe, expect, it } from "vitest";
import { toLikePattern } from "@/modules/store";

/**
 * 搜索的关键词会进 LIKE 模式，`%` 与 `_` 是通配符。
 * 不转义的话：搜「50%」变成「以 50 开头」，搜「a_b」会匹配到「axb」，
 * 用户看到的是一堆莫名其妙的结果，且完全无从排查。
 */
describe("搜索关键词的 LIKE 转义", () => {
  it("普通关键词两侧加通配符", () => {
    expect(toLikePattern("宠物")).toBe("%宠物%");
  });

  it("百分号被转义成字面量", () => {
    expect(toLikePattern("50%")).toBe("%50\\%%");
  });

  it("下划线被转义成字面量", () => {
    expect(toLikePattern("a_b")).toBe("%a\\_b%");
  });

  it("反斜杠本身先被转义，否则会吃掉后面的转义符", () => {
    expect(toLikePattern("C:\\temp")).toBe("%C:\\\\temp%");
  });

  it("空串只会得到 %%（由调用方决定是否走搜索分支）", () => {
    expect(toLikePattern("")).toBe("%%");
  });

  it("多个特殊字符逐个处理", () => {
    expect(toLikePattern("100%_off")).toBe("%100\\%\\_off%");
  });
});

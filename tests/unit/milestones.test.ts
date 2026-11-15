import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/api";
import { parseDueDate } from "@/server/services/milestones";

/**
 * 日期只按天存。这里要防的不是「格式不好看」，而是
 * `new Date("2026-13-45")` 会静默变成 Invalid Date 或滚动到下个月，
 * 最后在数据库里留下一个谁都解释不了的日期。
 */
describe("里程碑截止日期解析", () => {
  it("合法日期解析成当日 00:00 UTC", () => {
    const d = parseDueDate("2026-11-20");
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("空值返回 null（截止日期可以没有）", () => {
    expect(parseDueDate(undefined)).toBeNull();
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate("")).toBeNull();
  });

  it("斜杠格式被拒绝，而不是被 Date 猜成另一种日期", () => {
    expect(() => parseDueDate("2026/11/20")).toThrow(AppError);
    try {
      parseDueDate("2026/11/20");
    } catch (error) {
      expect((error as AppError).status).toBe(422);
      expect((error as AppError).code).toBe("VALIDATION_FAILED");
    }
  });

  it("不存在的日期（13 月 45 日）被拒绝", () => {
    expect(() => parseDueDate("2026-13-45")).toThrow(AppError);
  });

  it("带时间的字符串被拒绝：这个字段只接受日期", () => {
    expect(() => parseDueDate("2026-11-20T10:00:00Z")).toThrow(AppError);
  });
});

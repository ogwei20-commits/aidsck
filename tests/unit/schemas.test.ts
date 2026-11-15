import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  createTaskSchema,
  dataTypeSchema,
  patchProjectSchema,
} from "@/lib/validation/schemas";

describe("Zod 输入校验（文档 6：统一验证）", () => {
  it("合法项目自动补默认值", () => {
    const result = createProjectSchema.parse({ name: "菲律宾市场研究" });
    expect(result).toMatchObject({ name: "菲律宾市场研究", status: "planning", dataType: "U" });
  });

  it("拒绝过短名称", () => {
    expect(createProjectSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("拒绝超长描述", () => {
    expect(createProjectSchema.safeParse({ name: "合法项目", description: "x".repeat(2001) }).success).toBe(false);
  });

  it("只接受 R/E/P/S/U 五种数据类型", () => {
    for (const t of ["R", "E", "P", "S", "U"]) expect(dataTypeSchema.safeParse(t).success).toBe(true);
    expect(dataTypeSchema.safeParse("X").success).toBe(false);
  });

  it("拒绝空的 PATCH 请求", () => {
    expect(patchProjectSchema.safeParse({}).success).toBe(false);
  });

  it("拒绝越界进度", () => {
    expect(patchProjectSchema.safeParse({ progress: 101 }).success).toBe(false);
  });

  it("任务默认来源为 user", () => {
    expect(createTaskSchema.parse({ title: "整理佣金规则" }).source).toBe("user");
  });
});

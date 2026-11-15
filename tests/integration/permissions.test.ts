import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLogs, projects } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import {
  createApproval,
  createProject,
  ensureLocalUser,
  getProject,
  patchProject,
} from "@/server/services/workspace";

const uid = DEFAULT_USER_ID;
const ids: string[] = [];

describe("审批闸门必须能阻止未授权操作（F-11）", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
  });

  afterAll(async () => {
    const db = getDb();
    if (ids.length > 0) {
      await db.delete(projects).where(like(projects.name, "[测试] 审批%"));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
    }
    await closeDb();
  });

  it("无审批记录时归档被 403 阻止", async () => {
    const p = await createProject(uid, {
      name: "[测试] 审批-未批准项目",
      description: "",
      status: "planning",
      dataType: "U",
    });
    ids.push(p.id);
    await expect(patchProject(uid, p.id, { status: "archived" })).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
      status: 403,
    });
    const unchanged = await getProject(uid, p.id);
    expect(unchanged).toMatchObject({ status: "planning" });
  });

  it("写入审批记录后归档才允许执行", async () => {
    const p = await createProject(uid, {
      name: "[测试] 审批-已批准项目",
      description: "",
      status: "planning",
      dataType: "U",
    });
    ids.push(p.id);
    await createApproval(uid, {
      entityType: "project",
      entityId: p.id,
      decision: "approve",
      note: "[测试] 人工批准",
    });
    const updated = await patchProject(uid, p.id, { status: "archived" });
    expect(updated.status).toBe("archived");
  });
});

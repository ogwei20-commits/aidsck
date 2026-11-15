import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { projectMilestones, projects } from "@/db/schema";
import { DEFAULT_USER_ID } from "@/lib/config/env";
import { AppError } from "@/lib/errors/api";
import { createProject, ensureLocalUser } from "@/server/services/workspace";
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  patchMilestone,
} from "@/server/services/milestones";

const uid = DEFAULT_USER_ID;
const mkProject = (name: string) =>
  createProject(uid, { name, description: "", status: "planning", dataType: "U" });
let projectId = "";
let otherProjectId = "";

describe("项目里程碑真实读写", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("集成测试需要 DATABASE_URL");
    await ensureLocalUser(uid);
    const p = await mkProject("[测试] 里程碑项目");
    projectId = p.id;
    const q = await mkProject("[测试] 另一个项目");
    otherProjectId = q.id;
  });

  afterAll(async () => {
    const db = getDb();
    // 删除项目会级联删里程碑，这里再兜一次底，避免测试留下脏数据
    await db.delete(projectMilestones).where(like(projectMilestones.title, "[测试]%"));
    await db.delete(projects).where(like(projects.name, "[测试]%"));
    await closeDb();
  });

  it("新建后能按项目分组读回，完成数从 0 起算", async () => {
    const item = await createMilestone(uid, {
      projectId,
      title: "[测试] 拿到 3 家供应商报价",
      dueAt: "2026-12-01",
    });
    expect(item.dueAt).toBe("2026-12-01");
    expect(item.completedAt).toBeNull();

    const groups = await listMilestones(uid);
    const group = groups.find((g) => g.projectId === projectId);
    expect(group).toBeDefined();
    expect(group?.total).toBe(1);
    expect(group?.done).toBe(0);
    expect(group?.items[0].title).toBe("[测试] 拿到 3 家供应商报价");
  });

  it("完成与重开只改完成状态，不碰标题", async () => {
    const groups = await listMilestones(uid);
    const item = groups.find((g) => g.projectId === projectId)!.items[0];

    const done = await patchMilestone(uid, item.id, { done: true });
    expect(done.completedAt).not.toBeNull();
    expect(done.title).toBe(item.title);

    const reopened = await patchMilestone(uid, item.id, { done: false });
    expect(reopened.completedAt).toBeNull();
  });

  it("只改标题不会把已完成改回未完成", async () => {
    const groups = await listMilestones(uid);
    const item = groups.find((g) => g.projectId === projectId)!.items[0];
    await patchMilestone(uid, item.id, { done: true });

    const renamed = await patchMilestone(uid, item.id, { title: "[测试] 改过名字" });
    expect(renamed.title).toBe("[测试] 改过名字");
    // 这是最容易写错的地方：done 缺省被当成 false，改个名字就把进度清零
    expect(renamed.completedAt).not.toBeNull();
  });

  it("把里程碑挂到不属于自己的项目上会被拒绝", async () => {
    await expect(
      createMilestone(uid, { projectId: "00000000-0000-4000-8000-000000000000", title: "[测试] 越权" }),
    ).rejects.toThrow(AppError);
  });

  it("删除后再列就看不到，重复删返回 404", async () => {
    const created = await createMilestone(uid, { projectId: otherProjectId, title: "[测试] 待删除节点" });
    await deleteMilestone(uid, created.id);

    const groups = await listMilestones(uid);
    // 该项目下只剩这一条，删完整个项目就不在分组里了，所以按全局查
    expect(groups.some((g) => g.items.some((i) => i.id === created.id))).toBe(false);

    await expect(deleteMilestone(uid, created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("未完成的排在有完成项目的后面（有未完成项的项目优先展示）", async () => {
    // 另一个项目上留一条未完成
    await createMilestone(uid, { projectId: otherProjectId, title: "[测试] 未完成节点" });
    // 当前项目全部完成
    const groups = await listMilestones(uid);
    const mine = groups.find((g) => g.projectId === projectId);
    for (const item of mine?.items ?? []) {
      if (!item.completedAt) await patchMilestone(uid, item.id, { done: true });
    }
    const after = await listMilestones(uid);
    const firstWithOpen = after.findIndex((g) => g.total - g.done > 0);
    const firstAllDone = after.findIndex((g) => g.total > 0 && g.total === g.done);
    if (firstWithOpen >= 0 && firstAllDone >= 0) {
      expect(firstWithOpen).toBeLessThan(firstAllDone);
    }
  });
});

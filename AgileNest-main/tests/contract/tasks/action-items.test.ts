import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { taskAcceptanceEvents, taskActionItemOrigins, tasks } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject, createTeam } from "@/modules/identity";
import { createResource, deleteResource, getResource, updateResource } from "@/modules/resources";
import { createTaskActionItem, getTaskDetail, listProjectTasks } from "@/modules/tasks";
import { makeFixture, resetDb } from "../../helpers";

describe("文档与会议行动项", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  async function document(shared = false) {
    return createResource(fx.student.id, { ...(shared ? { teamId: fx.team.id } : { projectId: fx.project.id }), kind: "document", title: "会议纪要", body: "# 会议记录\n\n请核对测试报告并补充失败场景。", category: "meeting" });
  }

  it("来源、版本、真实摘录与任务在同一事务保存，资料删除受保护", async () => {
    const resource = await document();
    const task = await createTaskActionItem(fx.student.id, fx.project.id, { resourceId: resource.id, sourceVersion: resource.version, quote: "请核对测试报告并补充失败场景。", requestKey: randomUUID(), title: "核对测试报告", description: "按会议结论执行", dueDate: "2026-10-12" });
    expect(task).toMatchObject({ status: "unclaimed", title: "核对测试报告", dueDate: "2026-10-12", actionItemOrigin: { resourceId: resource.id, resourceTitle: "会议纪要", sourceVersion: 1, quote: "请核对测试报告并补充失败场景。", accessible: true } });
    expect((await getResource(fx.student.id, resource.id)).referenced).toBe(true);
    await expect(deleteResource(fx.student.id, resource.id, 1)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(taskActionItemOrigins)).toHaveLength(1);
    expect((await listProjectTasks(fx.teacher.id, fx.project.id))[0].actionItemOrigin?.sourceVersion).toBe(1);
  });

  it("过期来源版本不留下任务、来源或活动孤儿", async () => {
    const resource = await document();
    await updateResource(fx.student.id, resource.id, { version: 1, title: resource.title, tags: [], category: "meeting", body: "更新后的会议结论" });
    await expect(createTaskActionItem(fx.student.id, fx.project.id, { resourceId: resource.id, sourceVersion: 1, requestKey: randomUUID(), title: "过期行动项" })).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(tasks)).toEqual([]);
    expect(await db.select().from(taskActionItemOrigins)).toEqual([]);
    expect(await db.select().from(taskAcceptanceEvents)).toEqual([]);
  });

  it("不存在的摘录不能冒充文档内容，事务回滚", async () => {
    const resource = await document();
    await expect(createTaskActionItem(fx.student.id, fx.project.id, { resourceId: resource.id, sourceVersion: 1, quote: "文档中没有的决定", requestKey: randomUUID(), title: "伪造来源" })).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("同团队共享文档允许创建，其他项目和其他团队来源拒绝", async () => {
    const shared = await document(true);
    const task = await createTaskActionItem(fx.teacher.id, fx.project.id, { resourceId: shared.id, sourceVersion: 1, requestKey: randomUUID(), title: "共享资料行动项" });
    expect(task.actionItemOrigin?.resourceId).toBe(shared.id);
    const project = await createProject(fx.admin.id, fx.team.id, { name: "其他项目" });
    const another = await createResource(fx.admin.id, { projectId: project.id, kind: "document", title: "独立资料", body: "独立内容" });
    await expect(createTaskActionItem(fx.admin.id, fx.project.id, { resourceId: another.id, sourceVersion: 1, requestKey: randomUUID(), title: "跨项目" })).rejects.toBeInstanceOf(ForbiddenError);
    const otherTeam = await createTeam(fx.outsider.id, "其他团队");
    const foreign = await createResource(fx.outsider.id, { teamId: otherTeam.id, kind: "document", title: "私有团队文档", body: "其他团队内容" });
    await expect(createTaskActionItem(fx.admin.id, fx.project.id, { resourceId: foreign.id, sourceVersion: 1, requestKey: randomUUID(), title: "跨团队" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(tasks)).toHaveLength(1);
  });

  it("链接不能充当版本化文档来源，非成员不能创建", async () => {
    const link = await createResource(fx.student.id, { projectId: fx.project.id, kind: "link", title: "外部会议记录", url: "https://example.test/notes" });
    await expect(createTaskActionItem(fx.student.id, fx.project.id, { resourceId: link.id, sourceVersion: 1, requestKey: randomUUID(), title: "无正文来源" })).rejects.toBeInstanceOf(AppError);
    await expect(createTaskActionItem(fx.outsider.id, fx.project.id, { resourceId: link.id, sourceVersion: 1, requestKey: randomUUID(), title: "越权" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("重复与并发请求仅建立一个行动项，其他账号不能复用防重键", async () => {
    const resource = await document();
    const input = { resourceId: resource.id, sourceVersion: 1, requestKey: randomUUID(), title: "会后核对" };
    const [first, retry] = await Promise.all([createTaskActionItem(fx.student.id, fx.project.id, input), createTaskActionItem(fx.student.id, fx.project.id, input)]);
    expect(retry.id).toBe(first.id);
    expect(await db.select().from(tasks)).toHaveLength(1);
    expect(await db.select().from(taskActionItemOrigins)).toHaveLength(1);
    expect(await db.select().from(taskAcceptanceEvents)).toHaveLength(2);
    await expect(createTaskActionItem(fx.admin.id, fx.project.id, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("原文更新不会改写行动项来源快照，失败重试仍返回原任务", async () => {
    const resource = await document();
    const input = { resourceId: resource.id, sourceVersion: 1, requestKey: randomUUID(), title: "落实会议决定", quote: "请核对测试报告并补充失败场景。" };
    const original = await createTaskActionItem(fx.student.id, fx.project.id, input);
    await updateResource(fx.student.id, resource.id, { version: 1, title: "更新纪要", tags: [], category: "meeting", body: "本轮已执行完毕" });
    expect((await getTaskDetail(fx.teacher.id, original.id)).actionItemOrigin).toEqual(original.actionItemOrigin);
    expect((await createTaskActionItem(fx.student.id, fx.project.id, input)).id).toBe(original.id);
  });
});

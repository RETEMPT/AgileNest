import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskAcceptanceEvents, taskDiscussionPosts, teamMembers } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { createProject } from "@/modules/identity";
import { createTask, getTaskDetail, transitionTask } from "@/modules/tasks";
import { createResource, deleteResource, getResource, updateResource, uploadResource } from "@/modules/resources";
import { createTaskDiscussion, listDiscussionRevisions, listTaskDiscussions, setDiscussionResolved, updateTaskDiscussion, withdrawTaskDiscussion } from "@/modules/discussions";
import { discussionListSchema } from "@/modules/discussions/client";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);
async function discussionFixture() {
  const fixture = await makeFixture();
  const task = await createTask(fixture.student.id, fixture.project.id, { title: "讨论与文件" });
  return { ...fixture, task };
}

describe("任务讨论与任务附件", () => {
  it("项目成员可讨论，外部账号读写均被拒绝", async () => {
    const f = await discussionFixture();
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "# 实现讨论\n请核对这里。" });
    const listed = await listTaskDiscussions(f.teacher.id, f.task.id);
    expect(discussionListSchema.parse(listed).posts[0].id).toBe(post.id);
    expect(listed.posts[0].canEdit).toBe(false);
    await expect(listTaskDiscussions(f.outsider.id, f.task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTaskDiscussion(f.outsider.id, f.task.id, { body: "越权" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("一层回复绑定本任务，不能回复子回复或其他任务", async () => {
    const f = await discussionFixture();
    const root = await createTaskDiscussion(f.student.id, f.task.id, { body: "需要确认" });
    const reply = await createTaskDiscussion(f.teacher.id, f.task.id, { body: "已说明", parentId: root.id });
    expect(reply.parentId).toBe(root.id);
    await expect(createTaskDiscussion(f.student.id, f.task.id, { body: "二层", parentId: reply.id })).rejects.toBeInstanceOf(ConflictError);
    const otherTask = await createTask(f.student.id, f.project.id, { title: "另一任务" });
    await expect(createTaskDiscussion(f.student.id, otherTask.id, { body: "错绑", parentId: root.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTaskDiscussion(f.student.id, otherTask.id, root.id, { version: 1, body: "错改" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listDiscussionRevisions(f.student.id, otherTask.id, root.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("作者编辑保留历史，旧版本和他人编辑被拒绝", async () => {
    const f = await discussionFixture();
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "第一版" });
    const updated = await updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 1, body: "第二版" });
    expect(updated.version).toBe(2);
    await expect(updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 1, body: "旧版覆盖" })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateTaskDiscussion(f.admin.id, f.task.id, post.id, { version: 2, body: "管理员替写" })).rejects.toBeInstanceOf(ForbiddenError);
    const history = await listDiscussionRevisions(f.teacher.id, f.task.id, post.id);
    expect(history.map((entry) => [entry.version, entry.body, entry.kind])).toEqual([[1, "第一版", "create"], [2, "第二版", "edit"]]);
  });

  it("作者或管理员可撤回，普通成员无权限，历史和回复保留", async () => {
    const f = await discussionFixture();
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "保留审计" });
    const reply = await createTaskDiscussion(f.teacher.id, f.task.id, { body: "已有回复", parentId: post.id });
    await expect(withdrawTaskDiscussion(f.teacher.id, f.task.id, post.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    const withdrawn = await withdrawTaskDiscussion(f.admin.id, f.task.id, post.id, 1);
    expect(withdrawn).toMatchObject({ withdrawn: true, body: "", canEdit: false, canWithdraw: false, canResolve: false });
    expect((await listTaskDiscussions(f.student.id, f.task.id)).posts.map((entry) => entry.id)).toContain(reply.id);
    expect((await listDiscussionRevisions(f.teacher.id, f.task.id, post.id))[0].body).toBe("保留审计");
    await expect(createTaskDiscussion(f.teacher.id, f.task.id, { body: "不能新回复", parentId: post.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 2, body: "撤回后改" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("根帖作者、负责人和验收成员可解决或重开，回复与普通他人不可", async () => {
    const f = await discussionFixture();
    await transitionTask(f.student.id, f.task.id, "claim");
    const post = await createTaskDiscussion(f.teacher.id, f.task.id, { body: "老师的问题" });
    const reply = await createTaskDiscussion(f.student.id, f.task.id, { body: "处理说明", parentId: post.id });
    await expect(setDiscussionResolved(f.student.id, f.task.id, reply.id, { version: 1, resolved: true })).rejects.toBeInstanceOf(ConflictError);
    const resolved = await setDiscussionResolved(f.student.id, f.task.id, post.id, { version: 1, resolved: true });
    expect(resolved.resolved).toBe(true);
    await expect(createTaskDiscussion(f.admin.id, f.task.id, { body: "已解决不能回复", parentId: post.id })).rejects.toBeInstanceOf(ConflictError);
    expect((await setDiscussionResolved(f.admin.id, f.task.id, post.id, { version: 2, resolved: false })).resolved).toBe(false);
    expect((await createTaskDiscussion(f.student.id, f.task.id, { body: "重新讨论", parentId: post.id })).body).toBe("重新讨论");
    const foreign = await createTaskDiscussion(f.admin.id, f.task.id, { body: "另一问题" });
    await transitionTask(f.admin.id, f.task.id, "unclaim");
    await expect(setDiscussionResolved(f.student.id, f.task.id, foreign.id, { version: 1, resolved: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await setDiscussionResolved(f.teacher.id, f.task.id, foreign.id, { version: 1, resolved: true })).resolved).toBe(true);
  });

  it("附件可独立讨论，快照与原文件保留，撤回后仍不能删除", async () => {
    const f = await discussionFixture();
    const file = await uploadResource(f.student.id, { projectId: f.project.id }, { name: "问题.txt", bytes: new TextEncoder().encode("原内容") });
    const post = await createTaskDiscussion(f.student.id, f.task.id, { resourceIds: [file.id, file.id] });
    expect(post.resources).toHaveLength(1);
    expect(post.resources[0].fileName).toBe("问题.txt");
    expect((await getResource(f.teacher.id, file.id)).referenced).toBe(true);
    await updateResource(f.student.id, file.id, { version: 1, title: "后来更名", category: "general", tags: [] });
    expect((await listTaskDiscussions(f.teacher.id, f.task.id)).posts[0].resources[0].title).toBe("问题.txt");
    await withdrawTaskDiscussion(f.student.id, f.task.id, post.id, 1);
    await expect(deleteResource(f.admin.id, file.id, 2)).rejects.toBeInstanceOf(ConflictError);
  });

  it("附件拒绝其他项目和非文件，创建失败不留下空讨论", async () => {
    const f = await discussionFixture();
    const otherProject = await createProject(f.admin.id, f.team.id, { name: "隔离项目" });
    const wrong = await uploadResource(f.student.id, { projectId: otherProject.id }, { name: "隔离.txt", bytes: new TextEncoder().encode("隔离") });
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "正文文档" });
    for (const id of [wrong.id, doc.id, crypto.randomUUID()]) await expect(createTaskDiscussion(f.student.id, f.task.id, { body: "关联", resourceIds: [id] })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listTaskDiscussions(f.student.id, f.task.id)).posts).toHaveLength(0);
    const shared = await uploadResource(f.student.id, { teamId: f.team.id }, { name: "团队.txt", bytes: new TextEncoder().encode("全组共享") });
    expect((await createTaskDiscussion(f.teacher.id, f.task.id, { resourceIds: [shared.id] })).resources[0].id).toBe(shared.id);
  });

  it("已退出成员不能继续读、编辑、撤回、查看历史", async () => {
    const f = await discussionFixture();
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "退出之前" });
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, f.team.id), eq(teamMembers.userId, f.student.id)));
    await expect(listTaskDiscussions(f.student.id, f.task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 1, body: "退出之后" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withdrawTaskDiscussion(f.student.id, f.task.id, post.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDiscussionRevisions(f.student.id, f.task.id, post.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("空内容、超限内容、超限附件与非法版本不写入", async () => {
    const f = await discussionFixture();
    for (const input of [{ body: "  " }, { body: "a".repeat(10001) }, { resourceIds: Array.from({ length: 11 }, () => crypto.randomUUID()) }]) await expect(createTaskDiscussion(f.student.id, f.task.id, input)).rejects.toBeInstanceOf(AppError);
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "有效" });
    await expect(updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 1, body: "" })).rejects.toBeInstanceOf(AppError);
    await expect(withdrawTaskDiscussion(f.student.id, f.task.id, post.id, 0)).rejects.toBeInstanceOf(AppError);
    expect((await listTaskDiscussions(f.teacher.id, f.task.id)).posts).toHaveLength(1);
  });

  it("讨论创建、编辑、解决、撤回不改变任务状态或任务活动", async () => {
    const f = await discussionFixture();
    const originalEvents = await db.select().from(taskAcceptanceEvents).where(eq(taskAcceptanceEvents.taskId, f.task.id));
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "第一版" });
    await updateTaskDiscussion(f.student.id, f.task.id, post.id, { version: 1, body: "第二版" });
    await setDiscussionResolved(f.teacher.id, f.task.id, post.id, { version: 2, resolved: true });
    await withdrawTaskDiscussion(f.student.id, f.task.id, post.id, 3);
    expect((await getTaskDetail(f.teacher.id, f.task.id)).status).toBe("unclaimed");
    expect(await db.select().from(taskAcceptanceEvents).where(eq(taskAcceptanceEvents.taskId, f.task.id))).toEqual(originalEvents);
    expect((await listDiscussionRevisions(f.admin.id, f.task.id, post.id)).map((entry) => entry.kind)).toEqual(["create", "edit", "resolve", "withdraw"]);
  });

  it("列表截断仍保留回复根帖且总量不超过上限", async () => {
    const f = await discussionFixture();
    const post = await createTaskDiscussion(f.student.id, f.task.id, { body: "较早根帖" });
    const createdAt = new Date("2026-01-01T00:00:00Z");
    await db.update(taskDiscussionPosts).set({ createdAt }).where(eq(taskDiscussionPosts.id, post.id));
    await db.insert(taskDiscussionPosts).values(Array.from({ length: 201 }, (_, index) => ({ taskId: f.task.id, parentId: post.id, body: `回复 ${index}`, createdById: f.teacher.id, createdAt: new Date(createdAt.getTime() + index + 1000) })));
    const result = await listTaskDiscussions(f.student.id, f.task.id);
    expect(result.truncated).toBe(true);
    expect(result.posts).toHaveLength(200);
    expect(result.posts[0].id).toBe(post.id);
    expect(result.posts.filter((entry) => entry.parentId !== null).every((entry) => result.posts.some((root) => root.id === entry.parentId))).toBe(true);
  });
});

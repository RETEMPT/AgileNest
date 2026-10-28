import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { resourceComments, teamMembers, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createTask, createTaskActionItem } from "@/modules/tasks";
import { createProject, createTeam } from "@/modules/identity";
import { accessibleResourceIds, createResource, createResourceComment, createResourceFolder, deleteResource, getResource, getResourceCollaboration, linkResource, listResourceCommentHistory, listResourceComments, listResourceFolders, listResourceLinks, listTaskResourceLinks, placeResource, setResourceCollaboration, unlinkResource, updateResource, updateResourceComment, updateResourceFolder, uploadResource } from "@/modules/resources";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);
describe("目录、互链、内容评论与协作者", () => {
  it("目录创建者可重命名和移动，旧版本、循环与越权请求被拒绝", async () => {
    const f = await makeFixture(); const root = await createResourceFolder(f.student.id, { teamId: f.team.id, name: "设计" }); const child = await createResourceFolder(f.student.id, { teamId: f.team.id, parentId: root.id, name: "界面" });
    await expect(updateResourceFolder(f.student.id, { folderId: root.id, version: 1, name: "设计", parentId: child.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateResourceFolder(f.teacher.id, { folderId: root.id, version: 1, name: "越权", parentId: null })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await updateResourceFolder(f.admin.id, { folderId: child.id, version: 1, name: "前端", parentId: null })).version).toBe(2);
    await expect(updateResourceFolder(f.student.id, { folderId: child.id, version: 1, name: "旧覆盖", parentId: root.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(listResourceFolders(f.outsider.id, { teamId: f.team.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("目录与资料放置不改变范围，跨项目移动和旧位置版本被拒绝", async () => {
    const f = await makeFixture(); const shared = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "共享" }); const teamFolder = await createResourceFolder(f.admin.id, { teamId: f.team.id, name: "团队" }); const projectFolder = await createResourceFolder(f.admin.id, { projectId: f.project.id, name: "项目" });
    await expect(placeResource(f.student.id, { resourceId: shared.id, version: 1, folderId: projectFolder.id, pinned: false })).rejects.toBeInstanceOf(ForbiddenError);
    const placed = await placeResource(f.student.id, { resourceId: shared.id, version: 1, folderId: teamFolder.id, pinned: true }); expect(placed.folderId).toBe(teamFolder.id); expect(placed.projectId).toBeNull(); expect(placed.pinned).toBe(true); expect(placed.version).toBe(1);
    await expect(placeResource(f.student.id, { resourceId: shared.id, version: 1, folderId: null, pinned: false })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateResourceFolder(f.admin.id, { folderId: teamFolder.id, version: 1, parentId: projectFolder.id, name: "错误范围" })).rejects.toBeInstanceOf(ConflictError);
  });
  it("授予编辑不会授予管理，协作者可更新文档但不能删除和改权限", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "说明", body: "原稿" });
    await setResourceCollaboration(f.student.id, { resourceId: doc.id, version: 1, commentScope: "collaborators", collaborators: [{ userId: f.teacher.id, permission: "edit" }] });
    const actorDoc = await getResource(f.teacher.id, doc.id); expect(actorDoc.canManage).toBe(false); expect(actorDoc.canEdit).toBe(true); expect(actorDoc.canComment).toBe(true);
    expect((await updateResource(f.teacher.id, doc.id, { version: 1, title: "协作说明", body: "编辑者新稿", tags: [], category: "general" })).version).toBe(2);
    await expect(deleteResource(f.teacher.id, doc.id, 2)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setResourceCollaboration(f.teacher.id, { resourceId: doc.id, version: 2, commentScope: "team", collaborators: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setResourceCollaboration(f.admin.id, { resourceId: doc.id, version: 1, commentScope: "team", collaborators: [] })).rejects.toBeInstanceOf(ConflictError);
  });
  it("指定评论范围仍允许团队成员阅读，评论权限由服务端验证", async () => {
    const f = await makeFixture(); const doc = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "草案" });
    await setResourceCollaboration(f.admin.id, { resourceId: doc.id, version: 1, commentScope: "collaborators", collaborators: [{ userId: f.student.id, permission: "comment" }] });
    expect((await getResource(f.teacher.id, doc.id)).canComment).toBe(false);
    await expect(createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, body: "越权评论" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await createResourceComment(f.student.id, { resourceId: doc.id, resourceVersion: 1, body: "有权限评论" })).body).toBe("有权限评论");
    await expect(setResourceCollaboration(f.admin.id, { resourceId: doc.id, version: 2, commentScope: "team", collaborators: [{ userId: f.outsider.id, permission: "edit" }] })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("文件协作者能评论，原件与属性管理仍由作者和管理员维护", async () => {
    const f = await makeFixture(); const file = await uploadResource(f.student.id, { projectId: f.project.id }, { name: "证据.txt", bytes: new TextEncoder().encode("原内容") });
    await setResourceCollaboration(f.student.id, { resourceId: file.id, version: 1, commentScope: "collaborators", collaborators: [{ userId: f.teacher.id, permission: "edit" }] });
    const current = await getResource(f.teacher.id, file.id); expect(current.canEdit).toBe(false); expect(current.canComment).toBe(true);
    await expect(updateResource(f.teacher.id, file.id, { version: 1, title: "覆盖属性", tags: [], category: "general" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateResource(f.admin.id, file.id, { version: 1, title: "证据", body: "覆盖原件", tags: [], category: "general" })).rejects.toBeInstanceOf(AppError);
  });
  it("资料互链双向显示且重复建立不新增记录，读取链接不扩权", async () => {
    const f = await makeFixture(); const left = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "需求" }); const right = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "设计" });
    const first = await linkResource(f.student.id, { sourceResourceId: left.id, targetResourceId: right.id }); expect(await linkResource(f.admin.id, { sourceResourceId: right.id, targetResourceId: left.id })).toEqual(first);
    expect((await listResourceLinks(f.teacher.id, left.id))[0].direction).toBe("outgoing"); expect((await listResourceLinks(f.teacher.id, right.id))[0].direction).toBe("incoming");
    await expect(listResourceLinks(f.outsider.id, right.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unlinkResource(f.teacher.id, first.id)).rejects.toBeInstanceOf(ForbiddenError);
    await unlinkResource(f.student.id, first.id); expect(await listResourceLinks(f.admin.id, right.id)).toEqual([]);
  });
  it("任务反链校验同团队及项目，跨项目资料关联被拒绝", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "任务规格" }); const task = await createTask(f.student.id, f.project.id, { title: "实现" });
    await linkResource(f.student.id, { sourceResourceId: doc.id, targetTaskId: task.id }); expect((await listTaskResourceLinks(f.teacher.id, task.id)).links[0].targetId).toBe(doc.id);
    const otherProject = await createProject(f.admin.id, f.team.id, { name: "另一个项目" }); const otherTask = await createTask(f.student.id, otherProject.id, { title: "其他任务" });
    await expect(linkResource(f.student.id, { sourceResourceId: doc.id, targetTaskId: otherTask.id })).rejects.toBeInstanceOf(ForbiddenError);
    const otherDoc = await createResource(f.student.id, { projectId: otherProject.id, kind: "document", title: "其他项目资料" }); await expect(linkResource(f.student.id, { sourceResourceId: doc.id, targetResourceId: otherDoc.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("评论引文锚定原版本，文档更新后不伪造当前位置", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "纪要", body: "# 决议\n完成报告" });
    const comment = await createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, selectedQuote: "完成报告", line: 2, body: "请明确负责人" });
    await updateResource(f.student.id, doc.id, { version: 1, title: "纪要", body: "# 决议\n更新后的内容", tags: [], category: "meeting" });
    const historical = (await listResourceComments(f.admin.id, doc.id))[0]; expect(historical.resourceVersion).toBe(1); expect(historical.selectedQuote).toBe("完成报告"); expect(historical.line).toBe(2);
    await expect(createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, selectedQuote: "完成报告", body: "旧版创建" })).rejects.toBeInstanceOf(ConflictError);
    expect((await listResourceCommentHistory(f.student.id, comment.id))[0].body).toBe("请明确负责人");
  });
  it("评论编辑与撤回留痕，旧版本与其他作者操作被拒绝", async () => {
    const f = await makeFixture(); const doc = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "讨论" }); const comment = await createResourceComment(f.student.id, { resourceId: doc.id, resourceVersion: 1, body: "初稿意见" });
    await expect(updateResourceComment(f.teacher.id, { commentId: comment.id, version: 1, action: "edit", body: "越权" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await updateResourceComment(f.student.id, { commentId: comment.id, version: 1, action: "edit", body: "修改意见" })).version).toBe(2);
    await expect(updateResourceComment(f.student.id, { commentId: comment.id, version: 1, action: "withdraw" })).rejects.toBeInstanceOf(ConflictError);
    const withdrawn = await updateResourceComment(f.admin.id, { commentId: comment.id, version: 2, action: "withdraw" }); expect(withdrawn.body).toBe("");
    expect((await listResourceCommentHistory(f.teacher.id, comment.id)).map((row) => row.body)).toEqual(["修改意见", "修改意见", "初稿意见"]);
  });
  it("资料管理者解决评论，解决后禁止回复，重新打开可继续", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "资料" }); const comment = await createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, body: "问题" });
    await expect(updateResourceComment(f.teacher.id, { commentId: comment.id, version: 1, action: "resolve" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateResourceComment(f.student.id, { commentId: comment.id, version: 1, action: "resolve" });
    await expect(createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, parentId: comment.id, body: "继续回复" })).rejects.toBeInstanceOf(ConflictError);
    await updateResourceComment(f.admin.id, { commentId: comment.id, version: 2, action: "reopen" });
    const reply = await createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, parentId: comment.id, body: "补充说明" }); expect(reply.parentId).toBe(comment.id);
    await expect(updateResourceComment(f.admin.id, { commentId: reply.id, version: 1, action: "resolve" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("非法提及使评论及文档编辑同事务回滚", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "协作", body: "第一版" });
    await expect(createResourceComment(f.student.id, { resourceId: doc.id, resourceVersion: 1, body: "不存在的接收者", mentionedUserIds: [f.outsider.id] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(resourceComments).where(eq(resourceComments.resourceId, doc.id))).toHaveLength(0);
    await expect(updateResource(f.student.id, doc.id, { version: 1, title: "协作", body: "不应保存", tags: [], category: "general", mentionedUserIds: [f.outsider.id] })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getResource(f.student.id, doc.id)).version).toBe(1);
  });
  it("评论提及与每个版本保留姓名快照，处理状态继承原提及", async () => {
    const f = await makeFixture(); const doc = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "提及" });
    const comment = await createResourceComment(f.student.id, { resourceId: doc.id, resourceVersion: 1, body: "请协助核对", mentionedUserIds: [f.teacher.id] }); expect(comment.mentions).toEqual([{ userId: f.teacher.id, name: f.teacher.name }]);
    await db.update(users).set({ name: "更新后的成员姓名" }).where(eq(users.id, f.teacher.id));
    await updateResourceComment(f.student.id, { commentId: comment.id, version: 1, action: "edit", body: "再次核对", mentionedUserIds: [f.teacher.id] });
    const resolved = await updateResourceComment(f.admin.id, { commentId: comment.id, version: 2, action: "resolve" }); expect(resolved.mentions[0].name).toBe("更新后的成员姓名");
    const history = await listResourceCommentHistory(f.admin.id, comment.id); expect(history.map((row) => row.mentions[0].name)).toEqual(["更新后的成员姓名", "更新后的成员姓名", f.teacher.name]);
  });
  it("离开团队后单独编辑授权不再有效，批量可见性不会返回外部资料", async () => {
    const f = await makeFixture(); const doc = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "协作" });
    await setResourceCollaboration(f.admin.id, { resourceId: doc.id, version: 1, commentScope: "team", collaborators: [{ userId: f.student.id, permission: "edit" }] });
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, f.team.id), eq(teamMembers.userId, f.student.id)));
    await expect(getResource(f.student.id, doc.id)).rejects.toBeInstanceOf(ForbiddenError); expect(await accessibleResourceIds(f.student.id, [doc.id])).toEqual([]);
    const otherTeam = await createTeam(f.outsider.id, "外部团队"); const otherDoc = await createResource(f.outsider.id, { teamId: otherTeam.id, kind: "document", title: "外部资料" }); expect(await accessibleResourceIds(f.admin.id, [doc.id, otherDoc.id, doc.id])).toEqual([doc.id]);
    expect((await getResourceCollaboration(f.admin.id, doc.id)).collaborators).toHaveLength(0);
  });
  it("文档行动项在双端显示来源并保护删除，重复请求返回同一任务", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "会议纪要", body: "整理需求" }); const request = { resourceId: doc.id, sourceVersion: 1, requestKey: crypto.randomUUID(), title: "整理需求行动项", quote: "整理需求" };
    const task = await createTaskActionItem(f.student.id, f.project.id, request); expect((await createTaskActionItem(f.student.id, f.project.id, request)).id).toBe(task.id);
    expect((await listResourceLinks(f.teacher.id, doc.id)).find((link) => link.targetId === task.id)?.canRemove).toBe(false); expect((await listTaskResourceLinks(f.teacher.id, task.id)).links[0].targetId).toBe(doc.id);
    await expect(deleteResource(f.admin.id, doc.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(createTaskActionItem(f.student.id, f.project.id, { ...request, requestKey: crypto.randomUUID(), quote: "伪造来源" })).rejects.toBeInstanceOf(ConflictError);
  });
});

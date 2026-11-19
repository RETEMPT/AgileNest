import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { resourceFolders, resourcePlacements } from "@/db/schema";
import { makeFixture, resetDb } from "../../helpers";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { createResource, createResourceComment, createResourceFolder, deleteResource, deleteResourceFolder, getResource, getResourceFile, linkResource, listResourceComments, listResourceFolders, listResourceRevisions, listResources, listResourceTrash, placeResource, restoreResource, updateResource, updateResourceFolder, uploadResource } from "@/modules/resources";
import { selectResources } from "@/modules/resources/client";

beforeEach(resetDb);
describe("分类主题与可恢复资料", () => {
  it("旧混合目录保留原路径与各分类资料，升级后目录筛选不隐藏旧内容", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const [legacy] = await db.insert(resourceFolders).values({ teamId: f.team.id, projectId: f.project.id, name: "旧综合资料", createdById: f.student.id }).returning();
    const general = await createResource(f.student.id, { ...scope, category: "general", title: "说明", kind: "document" });
    const research = await createResource(f.student.id, { ...scope, category: "research", title: "参考", kind: "document" });
    const meeting = await createResource(f.student.id, { ...scope, category: "meeting", title: "纪要", kind: "document" });
    await db.insert(resourcePlacements).values([general, research, meeting].map((row) => ({ resourceId: row.id, folderId: legacy.id })));
    const folders = await listResourceFolders(f.teacher.id, scope); expect(folders[0].legacy).toBe(true);
    const rows = await listResources(f.teacher.id, scope);
    expect(selectResources(rows, { q: "", category: "general", kind: "all", scope: "all", resource: null, folder: legacy.id }, folders)).toHaveLength(3);
    expect(rows.every((row) => row.folderId === legacy.id)).toBe(true);
    expect(selectResources(rows, { q: "", category: "research", kind: "all", scope: "all", resource: null }, folders).map((row) => row.id)).toEqual([research.id]);
    const theme = await createResourceFolder(f.student.id, { ...scope, category: "research", name: "参考文献主题" });
    const moved = await placeResource(f.student.id, { resourceId: research.id, version: 1, folderId: theme.id, pinned: false });
    expect(moved.folderId).toBe(theme.id); expect((await getResource(f.teacher.id, meeting.id)).folderId).toBe(legacy.id);
  });
  it("每个分类可有同名主题，子目录继承分类并在当前路径创建文档", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const research = await createResourceFolder(f.student.id, { ...scope, category: "research", name: "阶段一" });
    const delivery = await createResourceFolder(f.student.id, { ...scope, category: "delivery", name: "阶段一" });
    const child = await createResourceFolder(f.student.id, { ...scope, parentId: research.id, name: "访谈" });
    expect(child.category).toBe("research"); expect(delivery.category).toBe("delivery");
    const doc = await createResource(f.student.id, { ...scope, category: "research", folderId: child.id, kind: "document", title: "访谈纪要", body: "原文" });
    expect(doc.folderId).toBe(child.id); expect(doc.category).toBe("research");
    await expect(createResourceFolder(f.student.id, { ...scope, category: "research", name: "阶段一" })).rejects.toBeInstanceOf(ConflictError);
  });
  it("当前目录上传原文件默认归位，不匹配分类或空间时整次创建回滚", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const folder = await createResourceFolder(f.admin.id, { ...scope, category: "delivery", name: "阶段报告" });
    const file = await uploadResource(f.student.id, scope, { name: "报告.txt", bytes: new TextEncoder().encode("真实报告") }, undefined, { category: "delivery", folderId: folder.id });
    expect(file.folderId).toBe(folder.id); expect((await getResourceFile(f.teacher.id, file.id)).bytes.toString()).toBe("真实报告");
    await expect(createResource(f.student.id, { ...scope, folderId: folder.id, category: "research", title: "错误分类", kind: "document" })).rejects.toBeInstanceOf(ConflictError);
    await expect(uploadResource(f.student.id, { teamId: f.team.id }, { name: "错误.txt", bytes: new TextEncoder().encode("文本") }, undefined, { category: "delivery", folderId: folder.id })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listResources(f.student.id, scope)).toHaveLength(1);
  });
  it("目录与资料只在同分类同范围移动，分类更改安全归根", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const a = await createResourceFolder(f.student.id, { ...scope, category: "meeting", name: "第一次会议" });
    const b = await createResourceFolder(f.student.id, { ...scope, category: "delivery", name: "交付" });
    const doc = await createResource(f.student.id, { ...scope, category: "meeting", folderId: a.id, title: "纪要", kind: "document" });
    await expect(updateResourceFolder(f.student.id, { folderId: a.id, version: a.version, name: a.name, parentId: b.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(placeResource(f.student.id, { resourceId: doc.id, version: doc.placementVersion ?? 1, folderId: b.id, pinned: false })).rejects.toBeInstanceOf(ConflictError);
    const changed = await updateResource(f.student.id, doc.id, { version: doc.version, title: doc.title, category: "delivery", tags: [] });
    expect(changed.folderId).toBeNull();
    const placed = await placeResource(f.student.id, { resourceId: doc.id, version: changed.placementVersion ?? 1, folderId: b.id, pinned: false });
    expect(placed.folderId).toBe(b.id);
  });
  it("空目录删除要求管理权和最新版本，非空及子树受到保护", async () => {
    const f = await makeFixture(); const scope = { teamId: f.team.id };
    const parent = await createResourceFolder(f.student.id, { ...scope, name: "父" });
    const child = await createResourceFolder(f.student.id, { ...scope, name: "子", parentId: parent.id });
    await expect(deleteResourceFolder(f.student.id, { folderId: parent.id, version: parent.version })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteResourceFolder(f.teacher.id, { folderId: child.id, version: child.version })).rejects.toBeInstanceOf(ForbiddenError);
    const changed = await updateResourceFolder(f.student.id, { folderId: child.id, version: child.version, name: "重命名", parentId: parent.id });
    await expect(deleteResourceFolder(f.admin.id, { folderId: child.id, version: child.version })).rejects.toBeInstanceOf(ConflictError);
    await deleteResourceFolder(f.admin.id, { folderId: child.id, version: changed.version });
    await deleteResourceFolder(f.student.id, { folderId: parent.id, version: parent.version });
    expect(await listResourceFolders(f.student.id, scope)).toEqual([]);
  });
  it("回收后旧文件与历史直达不可读取，恢复保留文件和原路径", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const folder = await createResourceFolder(f.student.id, { ...scope, category: "research", name: "资料" });
    const file = await uploadResource(f.student.id, scope, { name: "原件.txt", bytes: new TextEncoder().encode("不可替换的原件") }, undefined, { category: "research", folderId: folder.id });
    await deleteResource(f.student.id, file.id, file.version);
    await expect(getResource(f.student.id, file.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getResourceFile(f.admin.id, file.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listResourceRevisions(f.admin.id, file.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listResources(f.teacher.id, scope)).toHaveLength(0);
    const trash = await listResourceTrash(f.student.id, scope); expect(trash).toHaveLength(1);
    await expect(deleteResourceFolder(f.admin.id, { folderId: folder.id, version: folder.version })).rejects.toBeInstanceOf(ConflictError);
    const restored = await restoreResource(f.admin.id, { resourceId: file.id, version: trash[0].version });
    expect(restored.version).toBe(3); expect(restored.folderId).toBe(folder.id);
    expect((await getResourceFile(f.teacher.id, file.id)).bytes.toString()).toBe("不可替换的原件");
  });
  it("回收站仅作者和资料管理者可见可恢复，普通协作者和外人不可越权", async () => {
    const f = await makeFixture(); const scope = { teamId: f.team.id };
    const doc = await createResource(f.student.id, { ...scope, title: "草稿", kind: "document" }); await deleteResource(f.student.id, doc.id, doc.version);
    expect(await listResourceTrash(f.teacher.id, scope)).toEqual([]);
    await expect(listResourceTrash(f.outsider.id, scope)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreResource(f.teacher.id, { resourceId: doc.id, version: 2 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreResource(f.outsider.id, { resourceId: doc.id, version: 2 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreResource(f.student.id, { resourceId: doc.id, version: 1 })).rejects.toBeInstanceOf(ConflictError);
    await restoreResource(f.student.id, { resourceId: doc.id, version: 2 });
    await expect(restoreResource(f.admin.id, { resourceId: doc.id, version: 2 })).rejects.toBeInstanceOf(ConflictError);
  });
  it("恢复保留正文版本和评论历史，旧修改与旧回收不能覆盖新状态", async () => {
    const f = await makeFixture(); const doc = await createResource(f.student.id, { teamId: f.team.id, title: "原稿", kind: "document", body: "原稿正文" });
    await createResourceComment(f.teacher.id, { resourceId: doc.id, resourceVersion: 1, body: "仍需保留的意见" });
    await deleteResource(f.student.id, doc.id, 1); await restoreResource(f.student.id, { resourceId: doc.id, version: 2 });
    expect((await listResourceRevisions(f.teacher.id, doc.id)).map((row) => row.body)).toEqual(["原稿正文", "原稿正文"]);
    expect((await listResourceComments(f.teacher.id, doc.id))[0].body).toBe("仍需保留的意见");
    await expect(updateResource(f.student.id, doc.id, { version: 1, title: "旧覆盖", body: "旧", tags: [], category: "general" })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteResource(f.student.id, doc.id, 1)).rejects.toBeInstanceOf(ConflictError);
  });
  it("双向引用资料不能回收，防止有效任务和资料链接变成失效入口", async () => {
    const f = await makeFixture(); const scope = { projectId: f.project.id };
    const a = await createResource(f.student.id, { ...scope, title: "资料A", kind: "document" }); const b = await createResource(f.admin.id, { ...scope, title: "资料B", kind: "document" });
    await linkResource(f.student.id, { sourceResourceId: a.id, targetResourceId: b.id });
    expect((await getResource(f.teacher.id, a.id)).referenced).toBe(true);
    await expect(deleteResource(f.student.id, a.id, a.version)).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteResource(f.admin.id, b.id, b.version)).rejects.toBeInstanceOf(ConflictError);
    expect(await listResourceTrash(f.admin.id, scope)).toEqual([]);
  });
});

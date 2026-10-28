import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/modules/core";
import { updateMemberPositions } from "@/modules/identity";
import { createResource, createResourceFolder, getResource, listResourceFolders, setResourceCollaboration, updateResource, updateResourceFolder } from "@/modules/resources";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);
describe("副管理员的资料协作范围", () => {
  it("可管理他人资料与目录，撤职后旧请求不能继续操作", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "团队方案", body: "原稿" });
    const folder = await createResourceFolder(f.student.id, { projectId: f.project.id, name: "项目资料" });
    await updateMemberPositions(f.admin.id, f.team.id, f.teacher.id, ["deputy"]);
    expect((await getResource(f.teacher.id, doc.id)).canManage).toBe(true);
    expect((await listResourceFolders(f.teacher.id, { projectId: f.project.id }))[0].canManage).toBe(true);
    await setResourceCollaboration(f.teacher.id, { resourceId: doc.id, version: 1, commentScope: "collaborators", collaborators: [{ userId: f.student.id, permission: "comment" }] });
    expect((await updateResource(f.teacher.id, doc.id, { version: 1, title: "已整理方案", body: "新稿", category: "general", tags: [] })).version).toBe(2);
    expect((await updateResourceFolder(f.teacher.id, { folderId: folder.id, version: 1, name: "项目文档", parentId: null })).version).toBe(2);
    await updateMemberPositions(f.admin.id, f.team.id, f.teacher.id, ["advisor"]);
    expect((await getResource(f.teacher.id, doc.id)).canManage).toBe(false);
    await expect(updateResource(f.teacher.id, doc.id, { version: 2, title: "越权旧页", body: "覆盖", category: "general", tags: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateResourceFolder(f.teacher.id, { folderId: folder.id, version: 2, name: "旧页覆盖", parentId: null })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("学术身份与指导老师标签不会自动得到资料管理权", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "共享资料" });
    expect((await getResource(f.teacher.id, doc.id)).canManage).toBe(false);
    await expect(setResourceCollaboration(f.teacher.id, { resourceId: doc.id, version: 1, commentScope: "team", collaborators: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getResource(f.outsider.id, doc.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { makeFixture, resetDb } from "../../helpers";
import { ConflictError, ForbiddenError } from "@/modules/core";
import { createResource, deleteResource, getResource, listResourceRevisions, listResources, updateResource, uploadResource, getResourceFile } from "@/modules/resources";
import { resourceMetadataPatch } from "@/components/ai/shared-resources";

beforeEach(resetDb);

describe("AI 资料入口复用 resources 公开写入契约", () => {
  it("项目范围同时读取所属团队资料并拒绝外部账号", async () => {
    const f = await makeFixture();
    await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "团队规范" });
    await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "项目说明" });
    expect(await listResources(f.student.id, { projectId: f.project.id })).toHaveLength(2);
    await expect(listResources(f.outsider.id, { projectId: f.project.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("整理名称标签保留正文、分类和旧文档版本", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "草稿", body: "原始内容", category: "research" });
    const next = await updateResource(f.student.id, doc.id, resourceMetadataPatch(doc, "正式名称", "算法，课题"));
    expect(next).toMatchObject({ title: "正式名称", tags: ["算法", "课题"], body: "原始内容", category: "research", version: 2 });
    expect((await listResourceRevisions(f.student.id, doc.id)).find((item) => item.version === 1)?.title).toBe("草稿");
  });
  it("预览后版本变化时旧输入不能覆盖新内容", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "原名" });
    const planned = resourceMetadataPatch(doc, "旧方案", "");
    await updateResource(f.student.id, doc.id, { ...planned, title: "新名称" });
    await expect(updateResource(f.student.id, doc.id, planned)).rejects.toBeInstanceOf(ConflictError);
    expect((await getResource(f.student.id, doc.id)).title).toBe("新名称");
  });
  it("伪造客户端编辑能力不能越过服务端 ACL", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "作者文档" });
    const seen = await getResource(f.teacher.id, doc.id);
    const forged = resourceMetadataPatch({ ...seen, canEdit: true }, "越权改名", "");
    await expect(updateResource(f.teacher.id, doc.id, forged)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("回收后不能依赖已缓存资料继续读取或修改", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "待回收" });
    await deleteResource(f.student.id, doc.id, doc.version);
    await expect(getResource(f.student.id, doc.id)).rejects.toThrow();
    await expect(updateResource(f.student.id, doc.id, resourceMetadataPatch(doc, "旧输入", ""))).rejects.toThrow();
  });
  it("文件整理只改元数据，原始成果文件保持", async () => {
    const f = await makeFixture();
    const file = await uploadResource(f.student.id, { projectId: f.project.id }, { name: "报告.txt", bytes: new TextEncoder().encode("不可覆盖的成果") });
    await updateResource(f.student.id, file.id, resourceMetadataPatch(file, "实验报告", "成果"));
    expect((await getResourceFile(f.student.id, file.id)).bytes.toString()).toBe("不可覆盖的成果");
  });
});

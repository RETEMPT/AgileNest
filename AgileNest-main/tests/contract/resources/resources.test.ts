import { beforeEach, describe, expect, it } from "vitest";
import { makeFixture, resetDb } from "../../helpers";
import { createResource, deleteResource, getResource, getResourceFile, listResourceRevisions, listResources, updateResource, uploadResource } from "@/modules/resources";
import { ForbiddenError, ConflictError } from "@/modules/core";
import { createTask, getTaskDelivery, transitionTask } from "@/modules/tasks";
import { submitEvidence } from "../../delivery-fixtures";

beforeEach(resetDb);
describe("团队与项目共享资料", () => {
  it("作者创建文档，团队成员可读，外部账号不能查看", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "需求说明", body: "# 目标\n内容" });
    expect((await getResource(f.teacher.id, doc.id)).body).toContain("# 目标");
    expect((await getResource(f.teacher.id, doc.id)).canManage).toBe(false);
    await expect(getResource(f.outsider.id, doc.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("文档编辑保存新版本，旧版本仍可查看，旧请求不能覆盖", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { projectId: f.project.id, kind: "document", title: "说明", body: "第一版" });
    const patch = { version: 1, title: "说明", body: "第二版", category: "general" as const, tags: [] };
    expect((await updateResource(f.student.id, doc.id, patch)).version).toBe(2);
    await expect(updateResource(f.admin.id, doc.id, { ...patch, body: "旧版本覆盖" })).rejects.toBeInstanceOf(ConflictError);
    expect((await listResourceRevisions(f.teacher.id, doc.id)).map((r) => r.body)).toEqual(["第二版", "第一版"]);
  });
  it("其他普通成员不能修改或删除作者文档", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.student.id, { teamId: f.team.id, kind: "document", title: "资料" });
    await expect(updateResource(f.teacher.id, doc.id, { version: 1, title: "越权", category: "general", tags: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteResource(f.teacher.id, doc.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteResource(f.admin.id, doc.id, 1);
    expect(await listResources(f.student.id, { teamId: f.team.id })).toHaveLength(0);
  });
  it("项目查询包含团队共享资料，团队与项目不匹配被拒绝", async () => {
    const f = await makeFixture();
    await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "团队资料" });
    await createResource(f.student.id, { projectId: f.project.id, kind: "link", title: "参考", url: "https://example.test/reference" });
    expect(await listResources(f.teacher.id, { projectId: f.project.id })).toHaveLength(2);
    await expect(listResources(f.student.id, { teamId: crypto.randomUUID(), projectId: f.project.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("真实 UTF-8 文件可下载且列表不包含编码正文", async () => {
    const f = await makeFixture(); const body = "# 报告\n测试通过";
    const file = await uploadResource(f.student.id, { projectId: f.project.id }, { name: "报告.md", bytes: new TextEncoder().encode(body) });
    expect((await getResourceFile(f.teacher.id, file.id)).bytes.toString()).toBe(body);
    expect((await listResources(f.admin.id, { projectId: f.project.id }))[0]).not.toHaveProperty("contentBase64", expect.any(String));
    await expect(getResourceFile(f.outsider.id, file.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("伪造文件签名、二进制文本、非法JSON、超限与空文件被拒绝", async () => {
    const f = await makeFixture(); const scope = { teamId: f.team.id };
    for (const file of [
      { name: "假.pdf", bytes: new TextEncoder().encode("not a pdf") },
      { name: "假.png", bytes: new Uint8Array([1, 2, 3]) },
      { name: "坏.txt", bytes: new Uint8Array([0]) },
      { name: "坏.json", bytes: new TextEncoder().encode("{broken") },
      { name: "空.txt", bytes: new Uint8Array() },
      { name: "大.txt", bytes: new Uint8Array(10 * 1024 * 1024 + 1) },
    ]) await expect(uploadResource(f.student.id, scope, file)).rejects.toThrow();
    expect(await listResources(f.student.id, scope)).toHaveLength(0);
  });
  it("文件内容不可覆盖，资料属性可更新", async () => {
    const f = await makeFixture(); const file = await uploadResource(f.student.id, { teamId: f.team.id }, { name: "说明.txt", bytes: new TextEncoder().encode("原始成果") });
    await expect(updateResource(f.admin.id, file.id, { version: 1, title: "说明", body: "篡改成果", tags: [], category: "delivery" })).rejects.toThrow("不能覆盖");
    await updateResource(f.student.id, file.id, { version: 1, title: "交付说明", tags: ["报告"], category: "delivery" });
    expect((await getResourceFile(f.teacher.id, file.id)).bytes.toString()).toBe("原始成果");
  });
  it("拒绝脚本与带凭据的链接", async () => {
    const f = await makeFixture();
    for (const url of ["javascript:alert(1)", "data:text/html,abc", "https://name:secret@example.test/"]) await expect(createResource(f.student.id, { teamId: f.team.id, kind: "link", title: "链接", url })).rejects.toThrow();
  });
  it("提交证据保留真实文件快照并阻止删除", async () => {
    const f = await makeFixture(); const task = await createTask(f.student.id, f.project.id, { title: "交付" });
    await transitionTask(f.student.id, task.id, "claim");
    const file = await uploadResource(f.student.id, { projectId: f.project.id }, { name: "成果.txt", bytes: new TextEncoder().encode("成果内容") });
    await submitEvidence(f.student.id, task.id, "已完成");
    const delivery = (await getTaskDelivery(f.teacher.id, task.id)).submissions[0];
    await transitionTask(f.teacher.id, task.id, "reject", { review: { submissionId: delivery.id, summary: "请补充文件", checks: delivery.criteria.map((criterion) => ({ criterionId: criterion.id, passed: false, note: "需要文件" })) } });
    const requirements = (await getTaskDelivery(f.student.id, task.id)).requirements;
    await transitionTask(f.student.id, task.id, "resubmit", { delivery: { summary: "已补充", verification: "核对输出", requirementsVersion: requirements.version, links: [], resourceIds: [file.id], checks: requirements.criteria.map((criterion) => ({ criterionId: criterion.id, met: true })) } });
    expect((await getTaskDelivery(f.teacher.id, task.id)).submissions[0].resources[0].fileName).toBe("成果.txt");
    await expect(deleteResource(f.admin.id, file.id, 1)).rejects.toBeInstanceOf(ConflictError);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { makeFixture, resetDb } from "../../helpers";
import { createResource, deleteResource, readResourceContent, updateResource, uploadResource } from "@/modules/resources";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";

beforeEach(resetDb);
describe("真实资料库文件读取边界", () => {
  it("成员读取项目文档并带回真实来源和版本", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.admin.id, { projectId: f.project.id, kind: "document", title: "验收说明", body: "# 验收\n逐项核对" });
    const content = await readResourceContent(f.student.id, doc.id, { expectedVersion: doc.version });
    expect(content.text).toBe("# 验收\n逐项核对"); expect(content.resource.id).toBe(doc.id); expect(content.version).toBe(1);
  });
  it("非团队成员不能读取文档或真实文件", async () => {
    const f = await makeFixture();
    const file = await uploadResource(f.admin.id, { projectId: f.project.id }, { name: "报告.md", bytes: Buffer.from("正文") });
    await expect(readResourceContent(f.outsider.id, file.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("过期引用409，重新读取最新内容不会返回历史正文", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.admin.id, { projectId: f.project.id, kind: "document", title: "说明", body: "旧正文" });
    await updateResource(f.admin.id, doc.id, { version: 1, title: "说明", body: "新正文", category: "general", tags: [] });
    await expect(readResourceContent(f.student.id, doc.id, { expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
    expect((await readResourceContent(f.student.id, doc.id, { expectedVersion: 2 })).text).toBe("新正文");
  });
  it("已回收资料不向AI返回正文", async () => {
    const f = await makeFixture();
    const doc = await createResource(f.admin.id, { teamId: f.team.id, kind: "document", title: "已撤回", body: "不再可用" });
    await deleteResource(f.admin.id, doc.id, doc.version);
    await expect(readResourceContent(f.student.id, doc.id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("真实文件原始字节可供成员提取，团队共享资料不需要项目ID", async () => {
    const f = await makeFixture();
    const text = "# 项目说明\nAPI: /v1\nEnglish text & 中文";
    const file = await uploadResource(f.admin.id, { teamId: f.team.id }, { name: "规范.md", bytes: Buffer.from(text) });
    const content = await readResourceContent(f.teacher.id, file.id);
    expect(content.text).toBe(text); expect(content.resource.fileName).toBe("规范.md"); expect(content.resource.projectId).toBeNull();
  });
  it("PDF资料存在也不宣称成功提取，外部链接不发起抓取", async () => {
    const f = await makeFixture();
    const file = await uploadResource(f.admin.id, { teamId: f.team.id }, { name: "扫描.pdf", bytes: Buffer.from("%PDF-1.4\nempty") });
    await expect(readResourceContent(f.student.id, file.id)).rejects.toThrow("PDF");
    const link = await createResource(f.admin.id, { teamId: f.team.id, kind: "link", title: "外部网页", url: "https://example.test" });
    await expect(readResourceContent(f.student.id, link.id)).rejects.toThrow("未读取外部网页");
  });
});

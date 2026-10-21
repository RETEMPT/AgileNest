import { describe, expect, it } from "vitest";
import type { ResourceDTO } from "@/modules/resources/client";
import { resourceCitation, resourceMetadataPatch, resourceTextPage, sharedResourceUrl } from "@/components/ai/shared-resources";

const doc: ResourceDTO = { id: "resource", teamId: "team", projectId: "project", kind: "document", title: "算法方案", body: "# 目标\n原文", url: null, fileName: null, mimeType: null, size: 0, tags: ["算法"], category: "research", version: 3, createdById: "author", authorName: "作者", updatedAt: "2026-10-14T00:00:00Z", createdAt: "2026-10-14T00:00:00Z", canManage: true, canEdit: true, referenced: false };

describe("AI 工作区共享资料引用与整理", () => {
  it("文档引用固定版本，管理入口仍指向当前资料", () => {
    expect(sharedResourceUrl(doc, true)).toBe("/p/project/resources?resource=resource&revision=3");
    expect(sharedResourceUrl(doc)).toBe("/p/project/resources?resource=resource");
  });
  it("团队资料使用团队入口，文件不伪造文档历史", () => {
    expect(sharedResourceUrl({ ...doc, projectId: null }, true)).toContain("/t/team/resources?");
    expect(sharedResourceUrl({ ...doc, kind: "file" }, true)).not.toContain("revision");
  });
  it("每段 60 行，处理 Windows 换行与超范围页码", () => {
    const body = Array.from({ length: 65 }, (_, i) => `第 ${i + 1} 行`).join("\r\n");
    expect(resourceTextPage(body, 2)).toMatchObject({ page: 2, pages: 2, startLine: 61, endLine: 65, text: "第 61 行\n第 62 行\n第 63 行\n第 64 行\n第 65 行" });
    expect(resourceTextPage(body, 99).page).toBe(2);
    expect(resourceTextPage(body, NaN).page).toBe(1);
  });
  it("引用保留真实行号，来源模式不复制正文", () => {
    expect(resourceCitation(doc, 1, true)).toContain("原文 L1–L2：\n> # 目标\n> 原文");
    expect(resourceCitation(doc, 1, false)).not.toContain("# 目标");
    expect(resourceCitation(doc, 1, false)).toContain("读取版本：v3");
  });
  it("截断摘录明确标识且不声称完整引用该段", () => {
    const citation = resourceCitation({ ...doc, body: "a".repeat(1900) + "\n未引用行" }, 1, true);
    expect(citation).toContain("L1–L1（摘录截断）");
    expect(citation).not.toContain("未引用行");
  });
  it("只有当前编辑能力可生成修改输入，显式 false 不回退为 true", () => {
    expect(() => resourceMetadataPatch({ ...doc, canManage: false, canEdit: false }, "新名", "")).toThrow("权限");
    expect(() => resourceMetadataPatch({ ...doc, canEdit: false }, "新名", "")).toThrow("权限");
    expect(resourceMetadataPatch({ ...doc, canManage: false, canEdit: true }, "新名", "").title).toBe("新名");
  });
  it("名称和标签规范化，保留版本与分类而不携带正文", () => {
    expect(resourceMetadataPatch(doc, " 新名称 ", "算法，测试,算法\n 文献 ")).toEqual({ version: 3, title: "新名称", tags: ["算法", "测试", "文献"], category: "research" });
  });
  it("链接修改保留原 URL，文件修改不带 body", () => {
    expect(resourceMetadataPatch({ ...doc, kind: "link", url: "https://example.test" }, "来源", "").url).toBe("https://example.test");
    expect(resourceMetadataPatch({ ...doc, kind: "file" }, "说明", "")).not.toHaveProperty("body");
  });
  it("拒绝空名称、过长名称、标签数和标签长度超限", () => {
    expect(() => resourceMetadataPatch(doc, " ", "")).toThrow("名称");
    expect(() => resourceMetadataPatch(doc, "a".repeat(161), "")).toThrow("160");
    expect(() => resourceMetadataPatch(doc, "标题", "a".repeat(25))).toThrow("24");
    expect(() => resourceMetadataPatch(doc, "标题", "1,2,3,4,5,6,7,8,9")).toThrow("8");
  });
});

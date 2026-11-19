import { describe, expect, it } from "vitest";
import { parseResourceQuery, resourceUploadError, resourceWorkspaceUrl, selectResources, RESOURCE_MAX_BYTES, type ResourceDTO } from "@/modules/resources/client";

const resourceId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
function row(id: string, overrides: Partial<ResourceDTO> = {}): ResourceDTO {
  return { id, teamId: "33333333-3333-4333-8333-333333333333", projectId: null, kind: "document", title: "需求说明", body: "验收标准", url: null, fileName: null, mimeType: null, size: 0, tags: ["设计"], category: "specification", version: 1, createdById: null, authorName: null, updatedAt: "2026-10-10T00:00:00Z", createdAt: "2026-10-10T00:00:00Z", canManage: false, referenced: false, ...overrides };
}

describe("资料库导航与附件边界", () => {
  it("直接资料链接与已保存的筛选可以同时恢复", () => {
    expect(parseResourceQuery(new URLSearchParams(`resource=${resourceId}&scope=team&kind=file&category=delivery&q=成果`))).toEqual({ resource: resourceId, scope: "team", kind: "file", category: "delivery", q: "成果" });
  });

  it("未知筛选和非法资料 ID 不会作为资源请求使用", () => {
    expect(parseResourceQuery(new URLSearchParams("resource=../../../settings&kind=archive&scope=private&category=constructor"))).toEqual({ q: "", category: "all", kind: "all", scope: "all", resource: null });
  });

  it("打开和关闭资料只改变 resource，保留多值与其他条件", () => {
    const params = new URLSearchParams("q=原文&kind=file&scope=project&tag=甲&tag=乙&other=1");
    const opened = new URL(resourceWorkspaceUrl("/p/example/resources", params, { resource: resourceId }), "https://example.test");
    const closed = new URL(resourceWorkspaceUrl(opened.pathname, opened.searchParams, { resource: null }), "https://example.test");
    expect(closed.searchParams.getAll("tag")).toEqual(["甲", "乙"]);
    expect(closed.searchParams.get("q")).toBe("原文");
    expect(closed.searchParams.get("scope")).toBe("project");
    expect(closed.searchParams.get("other")).toBe("1");
    expect(closed.searchParams.has("resource")).toBe(false);
    expect(params.has("resource")).toBe(false);
  });

  it("清空资料筛选仍保留当前打开的资源", () => {
    const url = new URL(resourceWorkspaceUrl("/t/example/resources", new URLSearchParams(`resource=${resourceId}&q=原文&category=research&kind=file&scope=team`), { q: "", category: "all", kind: "all", scope: "all" }), "https://example.test");
    expect(Array.from(url.searchParams.keys())).toEqual(["resource"]);
    expect(url.searchParams.get("resource")).toBe(resourceId);
  });

  it("团队共享与项目专属范围可独立筛选，不改变原列表", () => {
    const rows = [row("team"), row("project", { projectId }), row("another-project", { projectId: resourceId })];
    expect(selectResources(rows, parseResourceQuery(new URLSearchParams("scope=team"))).map((item) => item.id)).toEqual(["team"]);
    expect(selectResources(rows, parseResourceQuery(new URLSearchParams("scope=project"))).map((item) => item.id)).toEqual(["project", "another-project"]);
    expect(rows).toHaveLength(3);
  });

  it("类型、分类与正文关键词共同限定资料，不依赖列表标题", () => {
    const rows = [row("file", { projectId, kind: "file", body: "本次验收记录", category: "delivery" }), row("document", { body: "验收记录", category: "delivery" }), row("wrong-category", { kind: "file", body: "验收记录" })];
    expect(selectResources(rows, parseResourceQuery(new URLSearchParams("scope=project&kind=file&category=delivery&q=验收记录"))).map((item) => item.id)).toEqual(["file"]);
  });

  it("附件保留既有大小与格式限制，并允许大小边界和大写扩展名", () => {
    expect(resourceUploadError({ name: "成果.ZIP", size: RESOURCE_MAX_BYTES })).toBeNull();
    expect(resourceUploadError({ name: "报告.txt", size: 0 })).toContain("大于 0");
    expect(resourceUploadError({ name: "报告.txt", size: RESOURCE_MAX_BYTES + 1 })).toContain("10 MB");
    expect(resourceUploadError({ name: "程序.exe", size: 12 })).toContain("格式");
    expect(resourceUploadError({ name: "../报告.md", size: 12 })).toContain("名称");
  });
});

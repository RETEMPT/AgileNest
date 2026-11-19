import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseResourceQuery, selectResourceFiles, type ResourceDTO, type ResourceFolderDTO } from "@/modules/resources/client";
import { ResourceMarkdown, ResourceSource } from "../../../src/modules/resources/markdown-ui";

const folderId = "00000000-0000-4000-8000-000000000001";
const childId = "00000000-0000-4000-8000-000000000002";
const folders: ResourceFolderDTO[] = [
  { id: folderId, teamId: "team", projectId: null, parentId: null, name: "设计", version: 1, canManage: true },
  { id: childId, teamId: "team", projectId: null, parentId: folderId, name: "接口", version: 1, canManage: true },
];
function row(title: string, folder: string | null, patch: Partial<ResourceDTO> = {}): ResourceDTO {
  return { id: title, title, folderId: folder, teamId: "team", projectId: null, kind: "document", body: "# 接口说明", url: null, fileName: null, mimeType: null, size: 0, tags: [], category: "general", version: 1, createdById: null, authorName: null, updatedAt: "2026-10-14", createdAt: "2026-10-14", canManage: false, referenced: false, ...patch };
}
const rows = [row("根文档", null), row("设计.md", folderId), row("API.md", childId)];
function markdown(text: string) { return renderToStaticMarkup(createElement(ResourceMarkdown, { text, idPrefix: "test" })); }

describe("资料文件浏览与 Markdown 阅读", () => {
  it("目录默认收起，重复标题定位到不同真实行，跳过代码围栏内标题", () => {
    const html = markdown("# 标题\n```md\n# 代码标题\n```\n## 标题");
    expect(html).toContain("文章目录 · 2 节");
    expect(html).toContain('href="#test-line-1"');
    expect(html).toContain('href="#test-line-5"');
    expect(html).not.toContain('href="#test-line-3"');
    expect(html).not.toContain("<details open");
  });
  it("根目录不重复铺开子目录文件", () => {
    expect(selectResourceFiles(rows, parseResourceQuery(new URLSearchParams()), folders).map((item) => item.title)).toEqual(["根文档"]);
  });
  it("进入目录仅展示当前层文件", () => {
    expect(selectResourceFiles(rows, parseResourceQuery(new URLSearchParams({ folder: folderId })), folders).map((item) => item.title)).toEqual(["设计.md"]);
  });
  it("正文搜索覆盖所选目录及子目录", () => {
    expect(selectResourceFiles(rows, parseResourceQuery(new URLSearchParams({ folder: folderId, q: "接口" })), folders)).toHaveLength(2);
  });
  it("置顶优先，其余文件按名称自然排序", () => {
    expect(selectResourceFiles([row("文件10", null), row("文件2", null), row("置顶", null, { pinned: true })], parseResourceQuery(new URLSearchParams())).map((item) => item.title)).toEqual(["置顶", "文件2", "文件10"]);
  });
  it("保持范围和分类筛选，不绕过已提供的读取结果", () => {
    const query = parseResourceQuery(new URLSearchParams({ scope: "team", category: "research", q: "接口" }));
    expect(selectResourceFiles([...rows, row("文献", null, { category: "research" }), row("项目文献", null, { category: "research", projectId: "project" })], query).map((item) => item.title)).toEqual(["文献"]);
  });
  it("呈现标题、表格、有序列表、任务清单与代码原文", () => {
    const html = markdown("# 标题\n\n| 字段 | 类型 |\n| --- | ---: |\n| 名称 | `string` |\n\n1. 第一项\n2. 第二项\n\n- [x] 已完成\n\n```ts\nconst n = 1;\n```");
    expect(html).toContain('<h1 id="test-line-1"'); expect(html).toContain("<table"); expect(html).toContain("<ol"); expect(html).toContain("已勾选"); expect(html).toContain("const n = 1;");
  });
  it("Markdown 中的 HTML 与危险链接只显示为文字", () => {
    const html = markdown('<script>alert(1)</script>\n[危险](javascript:alert)\n[资料](https://example.test/doc)');
    expect(html).not.toContain("<script>"); expect(html).not.toContain('href="javascript:'); expect(html).toContain('href="https://example.test/doc"');
  });
  it("图片作为明确链接，阅读时不请求远端图片", () => {
    const html = markdown("![架构图](https://example.test/diagram.png)");
    expect(html).not.toContain("<img"); expect(html).toContain("图片：架构图");
  });
  it("源码保留真实行号和空行并限制单页渲染量", () => {
    const html = renderToStaticMarkup(createElement(ResourceSource, { text: "第一行\n\n<原文>" }));
    expect(html).toContain('aria-label="第 3 行"'); expect(html).toContain("&lt;原文&gt;");
    const large = renderToStaticMarkup(createElement(ResourceSource, { text: Array(250).fill("正文").join("\n") }));
    expect(large).toContain('aria-label="第 200 行"'); expect(large).not.toContain('aria-label="第 201 行"'); expect(large).toContain("下一页");
  });
});

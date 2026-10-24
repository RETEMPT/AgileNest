import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceFolders } from "@/modules/resources/folders-ui";
import type { ResourceDTO, ResourceFolderDTO } from "@/modules/resources/client";

const folders: ResourceFolderDTO[] = [
  { id: "parent", teamId: "team", projectId: "project", parentId: null, name: "访谈材料", category: "research", version: 1, canManage: false },
  { id: "child", teamId: "team", projectId: "project", parentId: "parent", name: "第一轮访谈", category: "research", version: 1, canManage: false },
];
const resource: ResourceDTO = { id: "document", teamId: "team", projectId: "project", kind: "document", title: "访谈结果", body: "真实检索正文", url: null, fileName: null, mimeType: null, size: 0, tags: [], category: "research", version: 1, createdById: null, authorName: null, updatedAt: "2026-10-15", createdAt: "2026-10-15", canManage: false, referenced: false, folderId: "child" };
function render(patch: Partial<Parameters<typeof ResourceFolders>[0]> = {}) {
  return renderToStaticMarkup(createElement(ResourceFolders, { folders, resources: [resource], teamId: "team", projectId: "project", selectedId: null, category: "all", recycle: false, createRequest: 0, onSelect: () => {}, onRecycle: () => {}, onReload: () => {}, ...patch }));
}
describe("资料目录按需展开", () => {
  it("初次全部资料只显示分类，主题和子目录不提前展开", () => {
    const html = render();
    expect(html).toContain("参考文献"); expect(html).toContain("展开参考文献目录");
    expect(html).not.toContain("访谈材料"); expect(html).not.toContain("第一轮访谈");
    expect(html).not.toContain('aria-expanded="true"');
  });
  it("主动选择分类后出现主题，子目录仍默认收起", () => {
    const html = render({ category: "research" });
    expect(html).toContain("访谈材料"); expect(html).not.toContain("第一轮访谈");
    expect(html).toContain('aria-label="展开 访谈材料" aria-expanded="false"');
  });
  it("目录深链接展开选中项的父路径，搜索也展开匹配资料路径", () => {
    for (const patch of [{ selectedId: "child" }, { searchMatches: [resource] }]) {
      const html = render(patch);
      expect(html).toContain("访谈材料"); expect(html).toContain("第一轮访谈");
      expect(html).toContain('aria-label="收起 访谈材料" aria-expanded="true"');
    }
  });
});

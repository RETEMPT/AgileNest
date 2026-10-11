import { describe, expect, it } from "vitest";
import { markerMarkdown, safeResourceUrl, textOutline, csvPreview } from "@/modules/resources/client";

describe("真实资料整理", () => {
  it("读取Marker的markdown产物，不生成新的摘要", () => {
    expect(markerMarkdown(JSON.stringify({ markdown: "# 原始标题\n原文" }))).toBe("# 原始标题\n原文");
  });
  it("读取嵌套转换块为纯文本，保留文字并去除标签", () => {
    expect(markerMarkdown(JSON.stringify({ children: [{ html: "<h1>标题</h1>", children: [{ html: "<p>原文 &amp; 表格</p>" }] }] }))).toBe("标题\n\n原文 & 表格");
  });
  it("无正文JSON不能假装已整理", () => {
    expect(() => markerMarkdown('{"count":2}')).toThrow("未找到");
  });
  it("过深转换块被拒绝", () => {
    let value: unknown = { text: "原文" }; for (let i = 0; i < 23; i++) value = { children: [value] };
    expect(() => markerMarkdown(JSON.stringify(value))).toThrow("层级");
  });
  it("目录给出真实行号，CSV保留引号内逗号", () => {
    expect(textOutline("# 标题\n正文\n## 要求")).toEqual([{ line: 1, title: "标题" }, { line: 3, title: "要求" }]);
    expect(csvPreview('名称,说明\n任务,"包含,逗号"').rows[1]).toEqual(["任务", "包含,逗号"]);
  });
  it("拒绝执行性URL", () => {
    expect(safeResourceUrl("javascript:alert(1)")).toBe(false); expect(safeResourceUrl("https://example.test/doc")).toBe(true);
  });
});

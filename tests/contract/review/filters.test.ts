import { describe, expect, it } from "vitest";
import { parseWorkbenchQuery, selectWorkbenchItems, workbenchUrl } from "@/modules/review/client";

const today = "2026-10-04";
const task = (id: string, patch: Partial<Parameters<typeof selectWorkbenchItems>[0][number]> = {}) => ({
  id,
  title: "检查数据",
  description: null,
  projectName: "实验室课题",
  projectId: "project-a",
  dueDate: null,
  priority: "medium" as const,
  sortOrder: 0,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...patch,
});
const query = (input = {}) => parseWorkbenchQuery(input);

describe("工作台筛选与排序", () => {
  it("未知分类、日期选项和重复参数回到可用默认值", () => {
    expect(query({ view: "unknown", q: ["a", "b"], due: "later" })).toEqual({ view: "mine", q: "", projectId: "", due: "all" });
  });
  it("关键词去除首尾空白且限制长度", () => {
    expect(query({ q: "  API  " }).q).toBe("API");
    expect(query({ q: "a".repeat(250) }).q).toHaveLength(200);
  });
  it("关键词不区分大小写并匹配标题、描述和项目", () => {
    const items = [task("title", { title: "API 验证" }), task("description", { description: "修复 Api" }), task("project", { projectName: "api 课题" }), task("other")];
    expect(selectWorkbenchItems(items, query({ q: " API " }), today).map((item) => item.id)).toEqual(["description", "project", "title"]);
  });
  it("项目条件不会匹配另一个同名项目", () => {
    const items = [task("a"), task("b", { projectId: "project-b" })];
    expect(selectWorkbenchItems(items, query({ projectId: "project-a" }), today).map((item) => item.id)).toEqual(["a"]);
  });
  it("逾期筛选排除今天、未来和未设日期", () => {
    const items = [task("old", { dueDate: "2026-10-03" }), task("today", { dueDate: today }), task("future", { dueDate: "2026-10-05" }), task("none")];
    expect(selectWorkbenchItems(items, query({ due: "overdue" }), today).map((item) => item.id)).toEqual(["old"]);
  });
  it("七天内包含今天到第六天，跨年仍按日历日期计算", () => {
    const items = [task("today", { dueDate: "2026-12-29" }), task("last", { dueDate: "2027-01-04" }), task("outside", { dueDate: "2027-01-05" }), task("old", { dueDate: "2026-12-28" }), task("none")];
    expect(selectWorkbenchItems(items, query({ due: "soon" }), "2026-12-29").map((item) => item.id)).toEqual(["today", "last"]);
  });
  it("关键词、项目和日期同时生效", () => {
    const items = [task("match", { title: "API", dueDate: today }), task("wrong-project", { title: "API", dueDate: today, projectId: "project-b" }), task("wrong-date", { title: "API" }), task("wrong-title", { dueDate: today })];
    expect(selectWorkbenchItems(items, query({ q: "api", projectId: "project-a", due: "soon" }), today).map((item) => item.id)).toEqual(["match"]);
  });
  it("逾期优先，其次优先级、截止日期和稳定顺序，不修改输入", () => {
    const items = [task("normal", { dueDate: "2026-10-06" }), task("high", { priority: "high", dueDate: "2026-10-10" }), task("undated"), task("overdue", { priority: "low", dueDate: "2026-10-02" }), task("stable-b", { dueDate: "2026-10-06", sortOrder: 1 }), task("stable-a", { dueDate: "2026-10-06", sortOrder: 1 })];
    const order = items.map((item) => item.id);
    expect(selectWorkbenchItems(items, query(), today).map((item) => item.id)).toEqual(["overdue", "high", "normal", "stable-a", "stable-b", "undated"]);
    expect(items.map((item) => item.id)).toEqual(order);
  });
  it("切换分类保留筛选且正确编码中文与特殊字符", () => {
    const initial = query({ q: "分析 & API", projectId: "project-a", due: "soon" });
    const url = new URL(workbenchUrl(initial, { view: "review" }), "http://localhost");
    expect(parseWorkbenchQuery(Object.fromEntries(url.searchParams))).toEqual({ ...initial, view: "review" });
  });
  it("清除筛选保留当前分类，不残留空参数", () => {
    expect(workbenchUrl(query({ view: "pool", q: "分析", due: "overdue", projectId: "project-a" }), { q: "", due: "all", projectId: "" })).toBe("/home?view=pool");
  });
});

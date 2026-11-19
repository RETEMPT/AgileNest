import { describe, expect, it } from "vitest";
import { paginateWorkbenchItems, parseWorkbenchQuery, selectWorkbenchItems, workbenchUrl } from "@/modules/review/client";

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
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  status: "in_progress" as const,
  ...patch,
});
const query = (input = {}) => parseWorkbenchQuery(input);

describe("工作台筛选与排序", () => {
  it("未知分类、日期选项和重复参数回到可用默认值", () => {
    expect(query({ view: "unknown", q: ["a", "b"], due: "later" })).toEqual({ view: "mine", q: "", projectId: "", due: "all", status: "all", sort: "smart", page: 1 });
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
  it("非法页码、重复参数、未知状态与排序不会进入查询", () => {
    for (const page of ["0", "-1", "1.5", "Infinity", "1e4", "9007199254740992", ["2", "3"]]) {
      expect(query({ page, status: "accepted", sort: "random" })).toMatchObject({ page: 1, status: "all", sort: "smart" });
    }
    expect(query({ page: "28" }).page).toBe(28);
  });
  it("今日到期和未设日期使用精确日期，排除其他日期", () => {
    const items = [task("old", { dueDate: "2026-10-03" }), task("today", { dueDate: today }), task("future", { dueDate: "2026-10-05" }), task("none")];
    expect(selectWorkbenchItems(items, query({ due: "today" }), today).map((item) => item.id)).toEqual(["today"]);
    expect(selectWorkbenchItems(items, query({ due: "undated" }), today).map((item) => item.id)).toEqual(["none"]);
  });
  it("需修改筛选与项目、关键词和日期求交集", () => {
    const items = [task("match", { status: "rejected", dueDate: today }), task("wrong-status", { dueDate: today }), task("wrong-date", { status: "rejected" }), task("wrong-project", { status: "rejected", dueDate: today, projectId: "other" })];
    expect(selectWorkbenchItems(items, query({ status: "rejected", due: "today", projectId: "project-a", q: "数据" }), today).map((item) => item.id)).toEqual(["match"]);
  });
  it("分类与状态不相交时返回空结果，不从其他队列补任务", () => {
    const items = [task("submitted", { status: "submitted" })];
    expect(selectWorkbenchItems(items, query({ view: "review", status: "rejected" }), today)).toEqual([]);
  });
  it("日期排序优先实际截止日期，未设日期置后", () => {
    const items = [task("high-later", { priority: "high", dueDate: "2026-10-10" }), task("low-sooner", { priority: "low", dueDate: today }), task("none", { priority: "high" })];
    expect(selectWorkbenchItems(items, query({ sort: "due" }), today).map((item) => item.id)).toEqual(["low-sooner", "high-later", "none"]);
  });
  it("最近更新排序不被旧任务的高优先级覆盖，相同时保持稳定", () => {
    const items = [task("old", { priority: "high" }), task("new-b", { updatedAt: new Date("2026-10-03T01:00:00Z") }), task("new-a", { updatedAt: new Date("2026-10-03T01:00:00Z") })];
    expect(selectWorkbenchItems(items, query({ sort: "updated" }), today).map((item) => item.id)).toEqual(["new-a", "new-b", "old"]);
    expect(items.map((item) => item.id)).toEqual(["old", "new-b", "new-a"]);
  });
  it("翻页保留筛选、状态与排序，链接可还原查询", () => {
    const initial = query({ q: "数据 & 结果", due: "today", status: "rejected", sort: "updated", projectId: "project-a" });
    const url = new URL(workbenchUrl(initial, { page: 2 }), "http://localhost");
    expect(parseWorkbenchQuery(Object.fromEntries(url.searchParams))).toEqual({ ...initial, page: 2 });
  });
  it("切换分类、修改单个条件或排序后回到第一页", () => {
    const initial = query({ page: "4", status: "rejected", due: "today", sort: "updated" });
    for (const changes of [{ view: "pool" as const, status: "all" as const }, { due: "all" as const }, { sort: "due" as const }, { q: "结果" }]) {
      const url = new URL(workbenchUrl(initial, changes), "http://localhost");
      expect(url.searchParams.has("page")).toBe(false);
    }
    expect(new URL(workbenchUrl(initial), "http://localhost").searchParams.get("page")).toBe("4");
  });
  it("分页每页十二项，跨页无遗漏或重复且不修改输入", () => {
    const items = Array.from({ length: 25 }, (_, i) => task(String(i)));
    const pages = [1, 2, 3].map((page) => paginateWorkbenchItems(items, page));
    expect(pages.map(({ items }) => items.length)).toEqual([12, 12, 1]);
    expect(pages.flatMap(({ items }) => items)).toEqual(items);
    expect(pages[1]).toMatchObject({ page: 2, totalPages: 3, start: 13, end: 24 });
    expect(items).toHaveLength(25);
  });
  it("任务处理后页数缩小时回到末页，空结果不显示虚假的第一项", () => {
    expect(paginateWorkbenchItems([task("remaining")], 999)).toMatchObject({ page: 1, totalPages: 1, start: 1, end: 1 });
    expect(paginateWorkbenchItems([], 2)).toEqual({ items: [], page: 1, totalPages: 1, start: 0, end: 0 });
  });
});

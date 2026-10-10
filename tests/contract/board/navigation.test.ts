import { describe, expect, it } from "vitest";
import { parseFilters, parseTaskQuery, serializeFilters, taskDetailUrl, workspaceUrl } from "@/modules/board/client";

const taskId = "75d0dbf3-1943-4324-8f99-9e8a9195eedd";
const otherTaskId = "d9bb677c-7d7f-4f8c-a758-99aa6bf703be";
const filters = { q: "验收 & API", status: ["submitted", "rejected"], priority: ["high", "medium"], assigneeId: "member", milestoneId: "node" };
const parseUrl = (value: string) => new URL(value, "http://localhost");

describe("任务详情与视图 URL", () => {
  it("合法直达任务可恢复，空值与无效标识不作为详情", () => {
    expect(parseTaskQuery(new URLSearchParams({ task: taskId }))).toBe(taskId);
    expect(parseTaskQuery(new URLSearchParams({ task: taskId.toUpperCase() }))).toBe(taskId);
    for (const value of ["", "unknown", "../private", "javascript:alert(1)"]) {
      expect(parseTaskQuery(new URLSearchParams({ task: value }))).toBeNull();
    }
    expect(parseTaskQuery(new URLSearchParams())).toBeNull();
  });
  it("重复 task 参数拒绝歧义，不选择第一个任务", () => {
    expect(parseTaskQuery(new URLSearchParams(`task=${taskId}&task=${otherTaskId}`))).toBeNull();
  });
  it("打开详情保留多选、中文搜索、分组和其他 URL 上下文", () => {
    const params = serializeFilters(filters);
    params.set("groupBy", "assignee");
    params.set("context", "原列表");
    const url = parseUrl(taskDetailUrl("/p/project/board", params, taskId));
    expect(parseFilters(url.searchParams)).toEqual(filters);
    expect(url.searchParams.get("groupBy")).toBe("assignee");
    expect(url.searchParams.get("context")).toBe("原列表");
    expect(parseTaskQuery(url.searchParams)).toBe(taskId);
    expect(params.has("task")).toBe(false);
  });
  it("切任务只替换 task，关闭仅移除 task", () => {
    const opened = parseUrl(workspaceUrl({ projectId: "project", view: "board", filters, groupBy: "milestone", taskId }));
    const changed = parseUrl(taskDetailUrl(opened.pathname, opened.searchParams, otherTaskId));
    expect(parseTaskQuery(changed.searchParams)).toBe(otherTaskId);
    const closed = parseUrl(taskDetailUrl(changed.pathname, changed.searchParams, null));
    expect(closed.searchParams.has("task")).toBe(false);
    expect(parseFilters(closed.searchParams)).toEqual(filters);
    expect(closed.searchParams.get("groupBy")).toBe("milestone");
  });
  it("任务池、看板与表格互转保留全部筛选和所选任务", () => {
    for (const view of ["tasks", "board", "table"] as const) {
      const url = parseUrl(workspaceUrl({ projectId: "project", view, filters, groupBy: "priority", taskId }));
      expect(url.pathname).toBe(`/p/project/${view}`);
      expect(parseFilters(url.searchParams)).toEqual(filters);
      expect(parseTaskQuery(url.searchParams)).toBe(taskId);
      expect(url.searchParams.get("groupBy")).toBe("priority");
    }
  });
  it("清除筛选可保留当前详情与非默认分组", () => {
    const url = parseUrl(workspaceUrl({ projectId: "project", view: "table", filters: {}, groupBy: "assignee", taskId }));
    expect(parseFilters(url.searchParams)).toEqual({});
    expect(parseTaskQuery(url.searchParams)).toBe(taskId);
    expect(url.searchParams.get("groupBy")).toBe("assignee");
  });
  it("无详情与默认分组的空视图没有空问号", () => {
    expect(workspaceUrl({ projectId: "project", view: "board", filters: {} })).toBe("/p/project/board");
    expect(taskDetailUrl("/p/project/table", new URLSearchParams({ task: taskId }), null)).toBe("/p/project/table");
  });
  it("浏览历史中的打开、关闭与视图地址均独立解析", () => {
    const before = workspaceUrl({ projectId: "project", view: "board", filters });
    const opened = taskDetailUrl(parseUrl(before).pathname, parseUrl(before).searchParams, taskId);
    const table = workspaceUrl({ projectId: "project", view: "table", filters, taskId });
    const history = [before, opened, table].map(parseUrl);
    expect(history.map((url) => parseTaskQuery(url.searchParams))).toEqual([null, taskId, taskId]);
    for (const url of history) expect(parseFilters(url.searchParams)).toEqual(filters);
  });
});

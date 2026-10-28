import { describe, expect, it } from "vitest";
import { parseFilters, savedTaskViewDeleteSchema, savedTaskViewInputSchema, savedTaskViewSchema, savedTaskViewSummary, savedTaskViewUpdateSchema, savedTaskViewUrl } from "@/modules/board/client";

const projectId = "11111111-1111-4111-8111-111111111111";
const labelId = "ABCDEFAB-1234-4234-8234-123456789ABC";
const input = { name: "  需要跟进的任务  ", layout: "board" as const, groupBy: "assignee" as const, filters: { status: ["rejected", "submitted", "submitted"], blocked: false, labelId, q: "  材料  " } };

describe("个人保存视图白名单与导航", () => {
  it("规范名称、重复状态和搜索，并保留明确的无阻塞筛选", () => {
    expect(savedTaskViewInputSchema.parse(input)).toEqual({ ...input, name: "需要跟进的任务", filters: { status: ["rejected", "submitted"], blocked: false, labelId: labelId.toLowerCase(), q: "材料" } });
  });
  it("不接受任意跳转、任务详情参数或客户端伪造所有人", () => {
    for (const extra of [{ url: "https://example.com" }, { task: projectId }, { userId: projectId }, { projectId }]) expect(savedTaskViewInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    for (const extra of [{ url: "/" }, { task: projectId }, { archived: true }]) expect(savedTaskViewInputSchema.safeParse({ ...input, filters: { ...input.filters, ...extra } }).success).toBe(false);
  });
  it("失效标签、成员和里程碑筛选仍会保存并打开到原范围", () => {
    const filters = { labelId: labelId.toLowerCase(), assigneeId: "22222222-2222-4222-8222-222222222222", milestoneId: "33333333-3333-4333-8333-333333333333", blocked: true };
    const parsed = savedTaskViewInputSchema.parse({ ...input, filters });
    const url = new URL(savedTaskViewUrl({ projectId, ...parsed }), "https://example.com");
    expect(parseFilters(url.searchParams)).toEqual(filters);
    expect(url.pathname).toBe(`/p/${projectId}/board`);
    expect(url.searchParams.get("groupBy")).toBe("assignee");
    expect(url.searchParams.has("task")).toBe(false);
  });
  it("搜索里的特殊符号被编码，不注入任务详情或外部跳转", () => {
    const q = `&task=${projectId}&url=https://example.com/#材料`;
    const parsed = savedTaskViewInputSchema.parse({ ...input, filters: { q } });
    const url = new URL(savedTaskViewUrl({ projectId, ...parsed }), "https://example.com");
    expect(url.searchParams.get("q")).toBe(q);
    expect(url.searchParams.has("task")).toBe(false);
    expect(url.searchParams.has("url")).toBe(false);
    expect(url.hash).toBe("");
  });
  it("未知布局、分组、状态和非法标签不被静默丢弃", () => {
    for (const patch of [{ layout: "gantt" }, { groupBy: "private" }, { filters: { status: ["done"] } }, { filters: { labelId: "missing" } }, { filters: { blocked: "0" } }]) expect(savedTaskViewInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("更新与删除必须携带有效版本，名称不能空白、换行或超长", () => {
    for (const version of [0, -1, 1.2, "1", undefined]) {
      expect(savedTaskViewUpdateSchema.safeParse({ ...input, version }).success).toBe(false);
      expect(savedTaskViewDeleteSchema.safeParse({ version }).success).toBe(false);
    }
    for (const name of [" ", "甲\n乙", "甲".repeat(81)]) expect(savedTaskViewInputSchema.safeParse({ ...input, name }).success).toBe(false);
  });
  it("未知持久化格式不冒充成功读取的视图", () => {
    const dto = { ...input, projectId, id: projectId, version: 1, schemaVersion: 1, createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };
    expect(savedTaskViewSchema.safeParse(dto).success).toBe(true);
    expect(savedTaskViewSchema.safeParse({ ...dto, schemaVersion: 2 }).success).toBe(false);
  });
  it("摘要把明确的false视作筛选，空条件不虚增计数", () => {
    expect(savedTaskViewSummary({ layout: "table", groupBy: "priority", filters: { blocked: false } })).toBe("表格 · 按优先级分组 · 1 项筛选");
    expect(savedTaskViewSummary({ layout: "tasks", groupBy: "status", filters: { status: [] } })).toBe("任务池 · 按状态分组 · 全部任务");
  });
});

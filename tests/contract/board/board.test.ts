import { describe, it, expect } from "vitest";
import {
  applyFilters,
  deriveColumns,
  parseFilters,
  serializeFilters,
  getMoveTransition,
} from "@/modules/board";
import type { TaskDTO } from "@/modules/tasks";

const labelId = "38b626fa-e050-48cd-9848-9f6ea252ea48";
const otherLabelId = "64d1bb75-d48d-4bff-bc9e-12d3f8209378";
const label = { id: labelId, projectId: "p1", name: "开发", color: "brand" as const, version: 1 };

function task(partial: Partial<TaskDTO> & { id: string }): TaskDTO {
  return {
    projectId: "p1",
    milestoneId: null,
    parentTaskId: null,
    title: partial.id,
    description: null,
    completionNote: null,
    rejectReason: null,
    assigneeId: null,
    assigneeName: null,
    createdById: null,
    startDate: null,
    dueDate: null,
    estimatedMinutes: null,
    status: "unclaimed",
    priority: "medium",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("board 纯函数契约", () => {
  it("采用成员 PR 的组内稳定排序，重分组不打乱顺序且不修改输入", () => {
    const input = [
      task({ id: "late", sortOrder: 2 }),
      task({ id: "new", sortOrder: 1, createdAt: new Date("2026-10-02") }),
      task({ id: "old", sortOrder: 1, createdAt: new Date("2026-10-01") }),
    ];
    for (const grouping of [
      "status",
      "priority",
      "assignee",
      "milestone",
    ] as const) {
      expect(
        deriveColumns(input, grouping)
          .flatMap((column) => column.tasks)
          .map((t) => t.id),
      ).toEqual(["old", "new", "late"]);
    }
    expect(input.map((t) => t.id)).toEqual(["late", "new", "old"]);
  });
  it("deriveColumns 按状态分五列且顺序稳定", () => {
    const cols = deriveColumns(
      [
        task({ id: "a", status: "submitted" }),
        task({ id: "b", status: "unclaimed" }),
      ],
      "status",
    );
    expect(cols.map((c) => c.id)).toEqual([
      "unclaimed",
      "in_progress",
      "submitted",
      "accepted",
      "rejected",
    ]);
    expect(cols.find((c) => c.id === "submitted")?.tasks).toHaveLength(1);
  });

  it("deriveColumns 按指派含未指派列", () => {
    const cols = deriveColumns(
      [
        task({ id: "a", assigneeId: "u1", assigneeName: "小明" }),
        task({ id: "b" }),
      ],
      "assignee",
    );
    expect(cols.map((c) => c.title)).toEqual(["小明", "未指派"]);
  });

  it("applyFilters 组合筛选", () => {
    const tasks = [
      task({
        id: "a",
        status: "in_progress",
        priority: "high",
        assigneeId: "u1",
      }),
      task({ id: "b", status: "unclaimed", priority: "low" }),
      task({
        id: "c",
        status: "in_progress",
        priority: "low",
        assigneeId: "u2",
      }),
    ];
    expect(applyFilters(tasks, { status: ["in_progress"] })).toHaveLength(2);
    expect(
      applyFilters(tasks, { status: ["in_progress"], priority: ["high"] }),
    ).toHaveLength(1);
    expect(applyFilters(tasks, { assigneeId: "u2" }).map((t) => t.id)).toEqual([
      "c",
    ]);
  });

  it("parseFilters / serializeFilters 往返一致", () => {
    const f = {
      status: ["in_progress", "submitted"],
      priority: ["high"],
      assigneeId: "u1",
      milestoneId: "m1",
    };
    const parsed = parseFilters(serializeFilters(f));
    expect(parsed).toEqual(f);
  });

  it("多个状态与优先级、中文搜索和成员节点条件完整往返", () => {
    const filters = {
      status: ["submitted", "rejected"],
      priority: ["high", "medium"],
      assigneeId: "u1",
      milestoneId: "m1",
      q: "验收 & API",
    };
    const query = serializeFilters(filters);
    query.set("groupBy", "assignee");
    expect(parseFilters(new URLSearchParams(query.toString()))).toEqual(filters);
    expect(query.get("groupBy")).toBe("assignee");
  });

  it("组合筛选后的分组数量仅计算匹配任务且不修改源列表", () => {
    const input = [
      task({ id: "match", title: "API 验收", status: "submitted", priority: "high", assigneeId: "u1", milestoneId: "m1" }),
      task({ id: "other-status", title: "API 验收", status: "accepted", priority: "high", assigneeId: "u1", milestoneId: "m1" }),
      task({ id: "other-member", title: "API 验收", status: "submitted", priority: "high", assigneeId: "u2", milestoneId: "m1" }),
      task({ id: "other-milestone", title: "API 验收", status: "submitted", priority: "high", assigneeId: "u1", milestoneId: "m2" }),
      task({ id: "other-priority", title: "API 验收", status: "submitted", priority: "low", assigneeId: "u1", milestoneId: "m1" }),
    ];
    const filtered = applyFilters(input, {
      q: "api", status: ["submitted", "rejected"], priority: ["high", "medium"], assigneeId: "u1", milestoneId: "m1",
    });
    expect(filtered.map((entry) => entry.id)).toEqual(["match"]);
    for (const groupBy of ["status", "assignee", "priority", "milestone"] as const) {
      expect(deriveColumns(filtered, groupBy).reduce((total, column) => total + column.tasks.length, 0)).toBe(1);
    }
    expect(input).toHaveLength(5);
    expect(applyFilters(input, { q: "无匹配关键词" })).toEqual([]);
  });

  it("搜索标题与描述，并保留 URL 搜索条件", () => {
    const tasks = [
      task({ id: "a", title: "API 验证" }),
      task({ id: "b", description: "api 文档" }),
      task({ id: "c" }),
    ];
    expect(applyFilters(tasks, { q: "api" }).map((task) => task.id)).toEqual([
      "a",
      "b",
    ]);
    expect(parseFilters(serializeFilters({ q: "API 验证" }))).toEqual({
      q: "API 验证",
    });
  });
  it("URL 忽略无效状态、空值与无效优先级", () => {
    expect(
      parseFilters(
        new URLSearchParams(
          "status=wrong&status=submitted&priority=wrong&assigneeId=&q=%20",
        ),
      ),
    ).toEqual({ status: ["submitted"] });
  });
  it("标签和阻塞状态与既有筛选同时生效，不修改任务对象", () => {
    const input = [
      task({ id: "match", title: "API 验证", status: "in_progress", priority: "high", assigneeId: "u1", milestoneId: "m1", labels: [label], blocked: true }),
      task({ id: "clear", title: "API 验证", status: "in_progress", priority: "high", assigneeId: "u1", milestoneId: "m1", labels: [label], blocked: false }),
      task({ id: "other", title: "API 验证", status: "in_progress", priority: "high", assigneeId: "u1", milestoneId: "m1", labels: [{ ...label, id: otherLabelId }], blocked: true }),
    ];
    const result = applyFilters(input, { q: "api", status: ["in_progress"], priority: ["high"], assigneeId: "u1", milestoneId: "m1", labelId, blocked: true });
    expect(result.map((entry) => entry.id)).toEqual(["match"]);
    expect(input.map((entry) => entry.blocked)).toEqual([true, false, true]);
  });
  it("无标签不能匹配所选标签，多标签任务按ID匹配", () => {
    const input = [task({ id: "none" }), task({ id: "multi", labels: [label, { ...label, id: otherLabelId, name: "测试" }] })];
    expect(applyFilters(input, { labelId: otherLabelId }).map((entry) => entry.id)).toEqual(["multi"]);
    expect(applyFilters(input, { labelId: "75d0dbf3-1943-4324-8f99-9e8a9195eedd" })).toEqual([]);
  });
  it("只看无阻塞包含旧摘要的普通任务，省略条件保留全部", () => {
    const input = [task({ id: "blocked", blocked: true }), task({ id: "clear", blocked: false }), task({ id: "legacy" })];
    expect(applyFilters(input, { blocked: false }).map((entry) => entry.id)).toEqual(["clear", "legacy"]);
    expect(applyFilters(input, { blocked: true }).map((entry) => entry.id)).toEqual(["blocked"]);
    expect(applyFilters(input, {})).toHaveLength(3);
  });
  it("标签和三种阻塞条件完整往返URL，false不能丢失", () => {
    for (const blocked of [true, false, undefined]) {
      const filters = { q: "前置验收 & API", labelId, ...(blocked !== undefined ? { blocked } : {}) };
      expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    }
  });
  it("非法或重复标签与阻塞参数忽略，不改变其他条件", () => {
    for (const suffix of ["labelId=bad&blocked=true", `labelId=${labelId}&labelId=${otherLabelId}&blocked=1&blocked=0`, "labelId=&blocked="]) {
      expect(parseFilters(new URLSearchParams(`q=API&${suffix}`))).toEqual({ q: "API" });
    }
    expect(parseFilters(new URLSearchParams({ labelId: labelId.toUpperCase(), blocked: "0" }))).toEqual({ labelId, blocked: false });
  });
  it("标签与阻塞筛选后的分组只计入匹配任务", () => {
    const input = [task({ id: "match", labels: [label], blocked: true }), task({ id: "clear", labels: [label], blocked: false })];
    const filtered = applyFilters(input, { labelId, blocked: true });
    for (const grouping of ["status", "assignee", "priority", "milestone"] as const) expect(deriveColumns(filtered, grouping).reduce((sum, column) => sum + column.tasks.length, 0)).toBe(1);
  });
  it("拖拽路径包含说明要求并按负责人限制", () => {
    const owned = task({ id: "a", status: "in_progress", assigneeId: "me" });
    expect(
      getMoveTransition(owned, "submitted", "student", "me"),
    ).toMatchObject({ action: "submit", noteRequired: true });
    expect(
      getMoveTransition(owned, "submitted", "student", "other"),
    ).toBeNull();
    expect(getMoveTransition(owned, "accepted", "admin", "me")).toBeNull();
  });
});

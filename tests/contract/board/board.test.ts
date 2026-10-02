import { describe, it, expect } from "vitest";
import {
  applyFilters,
  deriveColumns,
  parseFilters,
  serializeFilters,
  getMoveTransition,
} from "@/modules/board";
import type { TaskDTO } from "@/modules/tasks";

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

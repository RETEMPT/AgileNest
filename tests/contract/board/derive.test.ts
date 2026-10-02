import { describe, it, expect } from "vitest";
import {
  applyFilters,
  deriveColumns,
  parseFilters,
  serializeFilters,
} from "@/modules/board";
import type { TaskDTO } from "@/modules/tasks";

function makeTask(over: Partial<TaskDTO> & { id: string }): TaskDTO {
  return {
    projectId: "p1",
    milestoneId: null,
    parentTaskId: null,
    title: over.id,
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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("deriveColumns", () => {
  it("status 分组固定五列且顺序正确", () => {
    const tasks = [
      makeTask({ id: "a", status: "in_progress" }),
      makeTask({ id: "b", status: "unclaimed" }),
    ];
    const cols = deriveColumns(tasks, "status");
    expect(cols.map((c) => c.id)).toEqual([
      "unclaimed",
      "in_progress",
      "submitted",
      "accepted",
      "rejected",
    ]);
    expect(cols[0].title).toBe("待认领");
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["b"]);
    expect(cols[1].tasks.map((t) => t.id)).toEqual(["a"]);
  });

  it("priority 分组按 high/medium/low 顺序", () => {
    const tasks = [
      makeTask({ id: "low", priority: "low" }),
      makeTask({ id: "high", priority: "high" }),
    ];
    const cols = deriveColumns(tasks, "priority");
    expect(cols.map((c) => c.id)).toEqual(["high", "medium", "low"]);
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["high"]);
    expect(cols[2].tasks.map((t) => t.id)).toEqual(["low"]);
  });

  it("assignee 分组：null 归「未指派」且列在最前", () => {
    const tasks = [
      makeTask({ id: "u", assigneeId: null }),
      makeTask({ id: "alice", assigneeId: "u-alice", assigneeName: "Alice" }),
    ];
    const cols = deriveColumns(tasks, "assignee");
    expect(cols[0].id).toBe("unassigned");
    expect(cols[0].title).toBe("未指派");
    expect(cols[1].id).toBe("u-alice");
    expect(cols[1].title).toBe("Alice");
  });

  it("milestone 分组：null 归「无里程碑」", () => {
    const tasks = [
      makeTask({ id: "m", milestoneId: null }),
      makeTask({ id: "m1", milestoneId: "ms-1" }),
    ];
    const cols = deriveColumns(tasks, "milestone");
    expect(cols[0].id).toBe("none");
    expect(cols[0].title).toBe("无里程碑");
    expect(cols[1].id).toBe("ms-1");
  });

  it("组内按 sortOrder 升序排列", () => {
    const tasks = [
      makeTask({ id: "s2", status: "unclaimed", sortOrder: 2 }),
      makeTask({ id: "s1", status: "unclaimed", sortOrder: 1 }),
      makeTask({ id: "s3", status: "unclaimed", sortOrder: 3 }),
    ];
    const cols = deriveColumns(tasks, "status");
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("applyFilters", () => {
  it("多字段组合过滤", () => {
    const tasks = [
      makeTask({
        id: "hit",
        status: "unclaimed",
        priority: "high",
        assigneeId: "u1",
        milestoneId: "m1",
      }),
      makeTask({ id: "miss", status: "in_progress", priority: "low" }),
    ];
    const filtered = applyFilters(tasks, {
      status: ["unclaimed"],
      priority: ["high"],
      assigneeId: "u1",
      milestoneId: "m1",
    });
    expect(filtered.map((t) => t.id)).toEqual(["hit"]);
  });

  it("未设置的条件不过滤", () => {
    const tasks = [
      makeTask({ id: "a", status: "unclaimed" }),
      makeTask({ id: "b", status: "accepted" }),
    ];
    expect(applyFilters(tasks, {})).toHaveLength(2);
  });
});

describe("parseFilters / serializeFilters", () => {
  it("解析逗号分隔多值并往返一致", () => {
    const f = parseFilters(
      new URLSearchParams(
        "status=unclaimed,in_progress&priority=high&assignee=u1&milestone=m1",
      ),
    );
    expect(f).toEqual({
      status: ["unclaimed", "in_progress"],
      priority: ["high"],
      assigneeId: "u1",
      milestoneId: "m1",
    });

    const sp = serializeFilters(f);
    expect(sp.get("status")).toBe("unclaimed,in_progress");
    expect(sp.get("priority")).toBe("high");
    expect(sp.get("assignee")).toBe("u1");
    expect(sp.get("milestone")).toBe("m1");
  });

  it("空参数得到空对象", () => {
    expect(parseFilters(new URLSearchParams())).toEqual({});
    expect(serializeFilters({}).toString()).toBe("");
  });
});

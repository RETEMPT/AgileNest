import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  findTransition,
  TASK_STATUSES,
  TRANSITIONS,
  ACTION_ROLES,
} from "@/modules/tasks/client";

describe("状态机纯函数与交互权限", () => {
  it("负责人在进行中可以提交或退回", () => {
    expect(
      availableTransitions(
        { status: "in_progress", assigneeId: "me" },
        "student",
        "me",
      ).map((rule) => rule.action),
    ).toEqual(["unclaim", "submit"]);
  });
  it("其他学生无法操作别人的进行中和待修改任务", () => {
    for (const status of ["in_progress", "rejected"] as const)
      expect(
        availableTransitions({ status, assigneeId: "other" }, "student", "me"),
      ).toEqual([]);
  });
  it("教师可指派待认领任务，但不能自行认领", () => {
    expect(
      availableTransitions(
        { status: "unclaimed", assigneeId: null },
        "teacher",
        "me",
      ).map((rule) => rule.action),
    ).toEqual(["assign"]);
  });
  it("待验收的学生没有操作，教师可以通过或打回", () => {
    const task = { status: "submitted" as const, assigneeId: "me" };
    expect(availableTransitions(task, "student", "me")).toEqual([]);
    expect(
      availableTransitions(task, "teacher", "teacher").map(
        (rule) => rule.action,
      ),
    ).toEqual(["accept", "reject"]);
  });
  it("无负责人不能提交，即便是管理员", () => {
    expect(
      availableTransitions(
        { status: "in_progress", assigneeId: null },
        "admin",
        "me",
      ).some((rule) => rule.action === "submit"),
    ).toBe(false);
  });
  it("完成后只能由教师或管理员重新打开", () => {
    expect(
      availableTransitions(
        { status: "accepted", assigneeId: "me" },
        "student",
        "me",
      ),
    ).toEqual([]);
    expect(
      availableTransitions(
        { status: "accepted", assigneeId: "me" },
        "admin",
        "me",
      ).map((rule) => rule.action),
    ).toEqual(["reopen"]);
  });
  it("所有状态与角色组合的可用动作都来自唯一转移表", () => {
    for (const status of TASK_STATUSES)
      for (const role of ["admin", "teacher", "student"] as const) {
        for (const rule of availableTransitions(
          { status, assigneeId: "me" },
          role,
          "me",
        )) {
          expect(findTransition(rule.action, status)).toBe(rule);
          expect(ACTION_ROLES[rule.action]).toContain(role);
        }
      }
    for (const rule of TRANSITIONS)
      for (const status of TASK_STATUSES) {
        expect(Boolean(findTransition(rule.action, status))).toBe(
          rule.from.includes(status),
        );
      }
  });
});

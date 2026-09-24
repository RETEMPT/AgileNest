import { describe, it, expect } from "vitest";

import * as core from "@/modules/core";
import * as identity from "@/modules/identity";
import * as tasks from "@/modules/tasks";
import * as board from "@/modules/board";
import * as review from "@/modules/review";
import * as worklog from "@/modules/worklog";
import * as stats from "@/modules/stats";
import * as calendar from "@/modules/calendar";
import * as milestone from "@/modules/milestone";
import * as notify from "@/modules/notify";
import {
  TASK_STATUSES,
  STATUS_LABELS,
  TRANSITIONS,
  ACTION_ROLES,
  findTransition,
  allowedActions,
  ACTION_LABELS,
} from "@/modules/tasks/states";

describe("core 契约导出", () => {
  it("errors / permissions / session / dates / form 齐全", () => {
    for (const name of [
      "AppError",
      "ForbiddenError",
      "NotFoundError",
      "ConflictError",
      "NotImplementedError",
      "isUniqueViolation",
      "getProjectForUser",
      "requireProjectForUser",
      "getTeamMembership",
      "requireTeamRole",
      "requireTaskWrite",
      "requireReviewer",
      "todayISO",
      "isValidISODate",
      "addDaysISO",
      "daysBetween",
      "isOverdue",
      "isDueSoon",
      "formatMinutes",
      "monthGrid",
      "toFormError",
    ]) {
      expect(core, `core 缺少 ${name}`).toHaveProperty(name);
    }
  });
});

describe("identity 契约导出", () => {
  it("团队 / 项目函数齐全", () => {
    for (const name of [
      "createTeam",
      "joinTeam",
      "listMyTeams",
      "listTeamMembers",
      "updateMemberRole",
      "createProject",
      "listTeamProjects",
      "updateProject",
      "listMyProjects",
    ]) {
      expect(identity, `identity 缺少 ${name}`).toHaveProperty(name);
    }
  });
});

describe("业务模块契约导出（stub 期）", () => {
  it.each([
    [
      "tasks",
      tasks,
      [
        "listProjectTasks",
        "getTaskDetail",
        "createTask",
        "updateTask",
        "deleteTask",
        "transitionTask",
        "createSubtask",
        "listSubtasks",
        "setDueDate",
      ],
    ],
    [
      "board",
      board,
      ["deriveColumns", "applyFilters", "parseFilters", "serializeFilters", "moveTask"],
    ],
    [
      "review",
      review,
      [
        "listMyTodo",
        "listMyInProgress",
        "listMyRejected",
        "listUnclaimedPool",
        "listPendingReview",
        "listOverdueRisks",
        "listTaskEvents",
      ],
    ],
    ["worklog", worklog, ["addWorklog", "listWorklogs", "deleteWorklog"]],
    [
      "stats",
      stats,
      ["completionRatio", "projectCompletion", "taskHours", "memberContribution"],
    ],
    ["calendar", calendar, ["monthView"]],
    [
      "milestone",
      milestone,
      ["listMilestones", "createMilestone", "updateMilestone", "deleteMilestone"],
    ],
    [
      "notify",
      notify,
      [
        "notifyAssigned",
        "notifySubmitted",
        "notifyAccepted",
        "notifyRejected",
        "scanAndNotifyDue",
        "listMyNotifications",
        "markRead",
      ],
    ],
  ] as const)("%s 的 index.ts 导出签名齐全", (_name, mod, names) => {
    for (const n of names) {
      expect(mod, `缺少 ${n}`).toHaveProperty(n);
    }
  });
});

describe("五态状态机 TRANSITIONS 表", () => {
  it("五态齐全且中文标签完整", () => {
    expect(TASK_STATUSES).toEqual([
      "unclaimed",
      "in_progress",
      "submitted",
      "accepted",
      "rejected",
    ]);
    for (const s of TASK_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("八条转移动作齐全", () => {
    const actions = TRANSITIONS.map((t) => t.action).sort();
    expect(actions).toEqual(
      ["accept", "assign", "claim", "reject", "reopen", "resubmit", "submit", "unclaim"].sort(),
    );
  });

  it("claim: unclaimed → in_progress", () => {
    const r = findTransition("claim", "unclaimed");
    expect(r?.to).toBe("in_progress");
    expect(r?.selfOnly).toBe(true);
  });

  it("submit 需 note；reject 需 note；resubmit 需 note", () => {
    expect(findTransition("submit", "in_progress")?.noteRequired).toBe(true);
    expect(findTransition("resubmit", "rejected")?.noteRequired).toBe(true);
    expect(findTransition("reject", "submitted")?.noteRequired).toBe(true);
  });

  it("非法边返回 null（如 accepted 上 claim）", () => {
    expect(findTransition("claim", "accepted")).toBeNull();
    expect(findTransition("accept", "unclaimed")).toBeNull();
  });

  it("每个动作都有角色白名单与 UI 文案", () => {
    for (const t of TRANSITIONS) {
      expect(ACTION_ROLES[t.action]?.length).toBeGreaterThan(0);
      expect(ACTION_LABELS[t.action]).toBeTruthy();
    }
  });

  it("allowedActions：unclaimed 下 student 只能 claim，teacher 不能 claim", () => {
    expect(allowedActions("unclaimed", "student")).toContain("claim");
    expect(allowedActions("unclaimed", "teacher")).not.toContain("claim");
    expect(allowedActions("submitted", "teacher")).toContain("accept");
    expect(allowedActions("submitted", "student")).not.toContain("accept");
  });
});

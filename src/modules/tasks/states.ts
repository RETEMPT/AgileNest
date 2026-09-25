// 五态状态机 —— 唯一合法转移表。service 只查表执行，调优改这一张表即可。
import type { TaskAction, TaskStatus } from "@/db/schema";
import type { TeamRole } from "@/db/schema";

export const TASK_STATUSES: TaskStatus[] = [
  "unclaimed",
  "in_progress",
  "submitted",
  "accepted",
  "rejected",
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  unclaimed: "待认领",
  in_progress: "进行中",
  submitted: "待验收",
  accepted: "已完成",
  rejected: "待修改",
};

/** 动作 → 允许的角色 */
export const ACTION_ROLES: Record<TaskAction, TeamRole[]> = {
  claim: ["admin", "student"],
  unclaim: ["admin", "teacher", "student"],
  assign: ["admin", "teacher"],
  submit: ["admin", "student"],
  resubmit: ["admin", "student"],
  accept: ["admin", "teacher"],
  reject: ["admin", "teacher"],
  reopen: ["admin", "teacher"],
  update: ["admin", "teacher", "student"],
  create: ["admin", "teacher", "student"],
  delete: ["admin", "teacher"],
};

export type TransitionRule = {
  action: TaskAction;
  from: TaskStatus[];
  to: TaskStatus;
  /** 是否必须本人（assignee / 认领人）才能做 */
  selfOnly?: boolean;
  /** 是否必须填 note */
  noteRequired?: boolean;
  /** 教师 assign 时可把 assigneeId 换掉 */
  setsAssignee?: boolean;
  /** 说明文案（供 UI 按钮） */
  label: string;
};

/** 合法转移表：action + from → to。不在表中即非法（409）。 */
export const TRANSITIONS: TransitionRule[] = [
  {
    action: "claim",
    from: ["unclaimed"],
    to: "in_progress",
    selfOnly: true,
    label: "认领",
  },
  {
    action: "unclaim",
    from: ["in_progress", "rejected"],
    to: "unclaimed",
    label: "退回任务池",
  },
  {
    action: "assign",
    from: ["unclaimed", "in_progress", "rejected"],
    to: "in_progress",
    setsAssignee: true,
    label: "指派",
  },
  {
    action: "submit",
    from: ["in_progress"],
    to: "submitted",
    selfOnly: true,
    noteRequired: true,
    label: "提交",
  },
  {
    action: "resubmit",
    from: ["rejected"],
    to: "submitted",
    selfOnly: true,
    noteRequired: true,
    label: "重新提交",
  },
  {
    action: "accept",
    from: ["submitted"],
    to: "accepted",
    label: "验收通过",
  },
  {
    action: "reject",
    from: ["submitted"],
    to: "rejected",
    noteRequired: true,
    label: "打回",
  },
  {
    action: "reopen",
    from: ["accepted"],
    to: "in_progress",
    label: "重新打开",
  },
];

export function findTransition(
  action: TaskAction,
  from: TaskStatus,
): TransitionRule | null {
  return (
    TRANSITIONS.find((t) => t.action === action && t.from.includes(from)) ?? null
  );
}

/** 某状态下某角色可执行的动作列表（供 UI 渲染按钮）。 */
export function allowedActions(status: TaskStatus, role: TeamRole): TaskAction[] {
  return TRANSITIONS.filter(
    (t) => t.from.includes(status) && ACTION_ROLES[t.action].includes(role),
  ).map((t) => t.action);
}

export const ACTION_LABELS: Record<TaskAction, string> = {
  claim: "认领",
  unclaim: "退回池子",
  assign: "指派",
  submit: "提交",
  resubmit: "重新提交",
  accept: "验收通过",
  reject: "打回",
  reopen: "重新打开",
  update: "更新",
  create: "创建",
  delete: "删除",
};

/** admin/teacher 可删任务；student 不可 */
export function canDeleteTask(role: TeamRole) {
  return role === "admin" || role === "teacher";
}

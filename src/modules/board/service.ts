import type { TaskPriority } from "@/db/schema";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  transitionTask,
  updateTask,
  type TaskDTO,
} from "@/modules/tasks";

import type { BoardFilters, ColumnDef, GroupBy, MoveTaskPatch } from "./types";

const PRIORITY_ORDER: TaskPriority[] = ["high", "medium", "low"];
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/** 组内稳定排序：sortOrder 升序，再按创建时间兜底。 */
function bySortOrder(tasks: TaskDTO[]): TaskDTO[] {
  return [...tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function deriveColumns(tasks: TaskDTO[], groupBy: GroupBy): ColumnDef[] {
  const sorted = bySortOrder(tasks);

  switch (groupBy) {
    case "status":
      return TASK_STATUSES.map((s) => ({
        id: s,
        title: STATUS_LABELS[s],
        tasks: sorted.filter((t) => t.status === s),
      }));

    case "priority":
      return PRIORITY_ORDER.map((p) => ({
        id: p,
        title: PRIORITY_LABELS[p],
        tasks: sorted.filter((t) => t.priority === p),
      }));

    case "assignee": {
      const unassigned = sorted.filter((t) => t.assigneeId === null);
      const byAssignee = new Map<string, { name: string; tasks: TaskDTO[] }>();
      for (const t of sorted) {
        if (t.assigneeId === null) continue;
        const cur = byAssignee.get(t.assigneeId);
        if (cur) cur.tasks.push(t);
        else byAssignee.set(t.assigneeId, { name: t.assigneeName ?? t.assigneeId, tasks: [t] });
      }
      const cols: ColumnDef[] = [];
      if (unassigned.length) cols.push({ id: "unassigned", title: "未指派", tasks: unassigned });
      for (const [id, group] of [...byAssignee.entries()].sort((a, b) =>
        a[1].name.localeCompare(b[1].name),
      )) {
        cols.push({ id, title: group.name, tasks: group.tasks });
      }
      return cols;
    }

    case "milestone": {
      const noMilestone = sorted.filter((t) => t.milestoneId === null);
      const byMilestone = new Map<string, TaskDTO[]>();
      for (const t of sorted) {
        if (t.milestoneId === null) continue;
        const cur = byMilestone.get(t.milestoneId);
        if (cur) cur.push(t);
        else byMilestone.set(t.milestoneId, [t]);
      }
      const cols: ColumnDef[] = [];
      if (noMilestone.length) cols.push({ id: "none", title: "无里程碑", tasks: noMilestone });
      for (const [id, list] of byMilestone) cols.push({ id, title: id, tasks: list });
      return cols;
    }
  }
}

export function applyFilters(tasks: TaskDTO[], f: BoardFilters): TaskDTO[] {
  return tasks.filter((t) => {
    if (f.status?.length && !f.status.includes(t.status)) return false;
    if (f.assigneeId && t.assigneeId !== f.assigneeId) return false;
    if (f.priority?.length && !f.priority.includes(t.priority)) return false;
    if (f.milestoneId && t.milestoneId !== f.milestoneId) return false;
    return true;
  });
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  const f: BoardFilters = {};
  const status = params.get("status")?.split(",").filter(Boolean);
  const priority = params.get("priority")?.split(",").filter(Boolean);
  const assigneeId = params.get("assignee");
  const milestoneId = params.get("milestone");
  if (status?.length) f.status = status;
  if (priority?.length) f.priority = priority;
  if (assigneeId) f.assigneeId = assigneeId;
  if (milestoneId) f.milestoneId = milestoneId;
  return f;
}

export function serializeFilters(f: BoardFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status?.length) p.set("status", f.status.join(","));
  if (f.priority?.length) p.set("priority", f.priority.join(","));
  if (f.assigneeId) p.set("assignee", f.assigneeId);
  if (f.milestoneId) p.set("milestone", f.milestoneId);
  return p;
}

export async function moveTask(
  actorId: string,
  taskId: string,
  patch: MoveTaskPatch,
): Promise<TaskDTO> {
  // 改负责人 = 状态机 assign（教师/管理员），其余字段移动 = updateTask
  if (patch.assigneeId !== undefined) {
    return transitionTask(actorId, taskId, "assign", {
      assigneeId: patch.assigneeId ?? undefined,
    });
  }
  return updateTask(actorId, taskId, patch);
}

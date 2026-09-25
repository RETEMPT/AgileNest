import type { TaskDTO, TaskPatch, TransitionAction } from "@/modules/tasks";
import {
  getTaskDetail,
  transitionTask,
  updateTask,
} from "@/modules/tasks";
import { TASK_STATUSES, STATUS_LABELS, findTransition, ACTION_ROLES } from "@/modules/tasks/states";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { ConflictError } from "@/modules/core/errors";
import { getProjectForUser } from "@/modules/core/permissions";

export type GroupBy = "status" | "assignee" | "priority" | "milestone";

export type ColumnDef = {
  id: string;
  title: string;
  tasks: TaskDTO[];
};

export type BoardFilters = {
  status?: string[];
  assigneeId?: string;
  priority?: string[];
  milestoneId?: string;
};

const PRIORITY_ORDER: TaskPriority[] = ["high", "medium", "low"];
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

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
  const status = params.getAll("status").filter(Boolean);
  const priority = params.getAll("priority").filter(Boolean);
  const assigneeId = params.get("assigneeId") || undefined;
  const milestoneId = params.get("milestoneId") || undefined;
  return {
    ...(status.length && { status }),
    ...(priority.length && { priority }),
    ...(assigneeId && { assigneeId }),
    ...(milestoneId && { milestoneId }),
  };
}

export function serializeFilters(f: BoardFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const s of f.status ?? []) p.append("status", s);
  for (const s of f.priority ?? []) p.append("priority", s);
  if (f.assigneeId) p.set("assigneeId", f.assigneeId);
  if (f.milestoneId) p.set("milestoneId", f.milestoneId);
  return p;
}

export function deriveColumns(tasks: TaskDTO[], groupBy: GroupBy): ColumnDef[] {
  if (groupBy === "status") {
    return TASK_STATUSES.map((s) => ({
      id: s,
      title: STATUS_LABELS[s],
      tasks: tasks.filter((t) => t.status === s),
    }));
  }
  if (groupBy === "priority") {
    return PRIORITY_ORDER.map((p) => ({
      id: p,
      title: PRIORITY_LABELS[p],
      tasks: tasks.filter((t) => t.priority === p),
    }));
  }
  if (groupBy === "assignee") {
    const names = new Map<string, string>();
    for (const t of tasks) {
      if (t.assigneeId) names.set(t.assigneeId, t.assigneeName ?? t.assigneeId);
    }
    const cols: ColumnDef[] = [...names.entries()].map(([id, title]) => ({
      id,
      title,
      tasks: tasks.filter((t) => t.assigneeId === id),
    }));
    const unassigned = tasks.filter((t) => !t.assigneeId);
    if (unassigned.length > 0 || cols.length === 0) {
      cols.push({ id: "", title: "未指派", tasks: unassigned });
    }
    return cols;
  }
  // milestone
  const titles = new Map<string, string>();
  for (const t of tasks) {
    if (t.milestoneId) titles.set(t.milestoneId, t.milestoneId);
  }
  const cols: ColumnDef[] = [...titles.entries()].map(([id]) => ({
    id,
    title: id,
    tasks: tasks.filter((t) => t.milestoneId === id),
  }));
  const none = tasks.filter((t) => !t.milestoneId);
  cols.push({ id: "", title: "无里程碑", tasks: none });
  return cols;
}

function pickAction(
  from: TaskStatus,
  to: TaskStatus,
  role: "admin" | "teacher" | "student",
): TransitionAction {
  const candidates = (["claim", "unclaim", "assign", "submit", "resubmit", "accept", "reject", "reopen"] as TransitionAction[]).filter(
    (a) => {
      const r = findTransition(a, from);
      return r?.to === to && ACTION_ROLES[a].includes(role);
    },
  );
  if (candidates.length === 0) {
    throw new ConflictError("看板拖拽不支持该状态变更");
  }
  // 更「顺手」的优先：认领/提交/验收优先于指派/重开
  const prefer: TransitionAction[] = ["claim", "submit", "resubmit", "accept", "reject", "unclaim", "reopen", "assign"];
  for (const a of prefer) {
    if (candidates.includes(a)) return a;
  }
  return candidates[0];
}

/** 看板拖拽：只改状态/排序/属性，状态变更走 transitionTask。 */
export async function moveTask(
  actorId: string,
  taskId: string,
  patch: {
    status?: string;
    assigneeId?: string | null;
    priority?: string;
    milestoneId?: string | null;
    sortOrder?: number;
  },
): Promise<TaskDTO> {
  const detail = await getTaskDetail(actorId, taskId);
  const attrPatch: TaskPatch = {};
  if (patch.sortOrder !== undefined) attrPatch.sortOrder = patch.sortOrder;
  if (patch.priority !== undefined) attrPatch.priority = patch.priority as TaskPriority;
  if (patch.milestoneId !== undefined) attrPatch.milestoneId = patch.milestoneId;

  if (patch.assigneeId !== undefined && patch.assigneeId !== detail.assigneeId) {
    if (patch.assigneeId === null) {
      if (detail.status === "in_progress" || detail.status === "rejected") {
        return transitionTask(actorId, taskId, "unclaim");
      }
    } else if (
      detail.status === "unclaimed" ||
      detail.status === "in_progress" ||
      detail.status === "rejected"
    ) {
      return transitionTask(actorId, taskId, "assign", { assigneeId: patch.assigneeId });
    }
  }

  const nextStatus = patch.status as TaskStatus | undefined;
  if (nextStatus && nextStatus !== detail.status) {
    const access = await getProjectForUser(actorId, detail.projectId);
    const role = access?.role ?? "student";
    const action = pickAction(detail.status, nextStatus, role);
    return transitionTask(actorId, taskId, action);
  }

  if (Object.keys(attrPatch).length === 0) return detail;
  return updateTask(actorId, taskId, attrPatch);
}

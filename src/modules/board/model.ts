import type { TaskDTO } from "@/modules/tasks";
import {
  TASK_STATUSES,
  STATUS_LABELS,
  availableTransitions,
  type TransitionContext,
  type TransitionRule,
} from "@/modules/tasks/client";
import type { TaskPriority, TaskStatus, TeamRole } from "@/db/schema";

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
  q?: string;
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
    if (
      f.q &&
      !`${t.title} ${t.description ?? ""}`
        .toLocaleLowerCase()
        .includes(f.q.toLocaleLowerCase())
    )
      return false;
    return true;
  });
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  const status = params
    .getAll("status")
    .filter((value) => TASK_STATUSES.some((status) => status === value));
  const priority = params
    .getAll("priority")
    .filter((value) => PRIORITY_ORDER.some((priority) => priority === value));
  const assigneeId = params.get("assigneeId") || undefined;
  const milestoneId = params.get("milestoneId") || undefined;
  const q = params.get("q")?.trim() || undefined;
  return {
    ...(status.length && { status }),
    ...(priority.length && { priority }),
    ...(assigneeId && { assigneeId }),
    ...(milestoneId && { milestoneId }),
    ...(q && { q }),
  };
}

export function serializeFilters(f: BoardFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const s of f.status ?? []) p.append("status", s);
  for (const s of f.priority ?? []) p.append("priority", s);
  if (f.assigneeId) p.set("assigneeId", f.assigneeId);
  if (f.milestoneId) p.set("milestoneId", f.milestoneId);
  if (f.q) p.set("q", f.q);
  return p;
}

export const BOARD_STATUS_ORDER: TaskStatus[] = [
  "unclaimed",
  "in_progress",
  "submitted",
  "rejected",
  "accepted",
];

export function getMoveTransition(
  task: TransitionContext,
  target: TaskStatus,
  role: TeamRole,
  actorId: string,
): TransitionRule | null {
  if (task.status === target) return null;
  return (
    availableTransitions(task, role, actorId).find(
      (rule) => rule.to === target,
    ) ?? null
  );
}

export function deriveColumns(
  unsortedTasks: TaskDTO[],
  groupBy: GroupBy,
): ColumnDef[] {
  const tasks = [...unsortedTasks].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
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

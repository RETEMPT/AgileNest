import type { TaskDTO } from "@/modules/tasks";
import type { MilestoneDTO } from "./index";

export type MilestoneTask = Pick<TaskDTO, "id" | "projectId" | "milestoneId" | "parentTaskId" | "title" | "status" | "assigneeName" | "startDate" | "dueDate" | "sortOrder" | "blockedByIds" | "blocked">;
export type MilestoneSummary = Pick<MilestoneDTO, "id" | "projectId" | "title" | "description" | "kind" | "status" | "targetDate">;
export type MilestoneTaskNode = { task: MilestoneTask; children: MilestoneTaskNode[]; externalParent: MilestoneTask | null };
export type MilestoneTaskGroup = { id: string; milestone: MilestoneSummary | null; roots: MilestoneTaskNode[]; total: number; accepted: number };
export type TaskDependencyEdge = { from: string; to: string; crossMilestone: boolean; fulfilled: boolean };

export const MILESTONE_KIND_LABELS = { open_topic: "开题", midterm: "中期", final: "结题", defense: "答辩", custom: "自定义" } as const;
export const MILESTONE_STATUS_LABELS = { open: "进行中", done: "已完成" } as const;
export const UNGROUPED_MILESTONE = "ungrouped";

export function summarizeTaskBranch(node: MilestoneTaskNode) {
  const tasks: MilestoneTask[] = [];
  const visit = (current: MilestoneTaskNode) => { tasks.push(current.task); current.children.forEach(visit); };
  visit(node);
  const accepted = tasks.filter((task) => task.status === "accepted").length;
  return { total: tasks.length, accepted, submitted: tasks.filter((task) => task.status === "submitted").length, percent: Math.round(accepted / tasks.length * 100) };
}

export function buildMilestoneTaskGraph(projectId: string, milestones: MilestoneSummary[], tasks: MilestoneTask[]) {
  const projectMilestones = milestones.filter((item) => item.projectId === projectId).toSorted((a, b) => (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31"));
  const projectTasks = tasks.filter((task) => task.projectId === projectId).toSorted((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-CN"));
  const taskById = new Map(projectTasks.map((task) => [task.id, task]));
  const nodes = new Map(projectTasks.map((task) => [task.id, { task, children: [], externalParent: null } as MilestoneTaskNode]));
  const groups: MilestoneTaskGroup[] = projectMilestones.map((milestone) => ({ id: milestone.id, milestone, roots: [], total: 0, accepted: 0 }));
  const ungrouped: MilestoneTaskGroup = { id: UNGROUPED_MILESTONE, milestone: null, roots: [], total: 0, accepted: 0 };
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupFor = (task: MilestoneTask) => groupById.get(task.milestoneId ?? "") ?? ungrouped;

  for (const task of projectTasks) {
    const node = nodes.get(task.id)!;
    const group = groupFor(task);
    group.total += 1;
    if (task.status === "accepted") group.accepted += 1;
    const parent = task.parentTaskId ? nodes.get(task.parentTaskId) : undefined;
    if (parent && groupFor(parent.task) === group) parent.children.push(node);
    else {
      node.externalParent = parent?.task ?? null;
      group.roots.push(node);
    }
  }
  if (ungrouped.total || !groups.length) groups.push(ungrouped);
  const edges: TaskDependencyEdge[] = projectTasks.flatMap((task) => [...new Set(task.blockedByIds ?? [])].flatMap((from) => {
    const prerequisite = taskById.get(from);
    return prerequisite ? [{ from, to: task.id, crossMilestone: prerequisite.milestoneId !== task.milestoneId, fulfilled: prerequisite.status === "accepted" }] : [];
  }));
  return { groups, tasks: projectTasks, edges };
}

export function filterMilestoneTree(nodes: MilestoneTaskNode[], query: string): MilestoneTaskNode[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return nodes;
  return nodes.flatMap((node) => {
    const children = filterMilestoneTree(node.children, q);
    return `${node.task.title} ${node.task.assigneeName ?? ""}`.toLocaleLowerCase().includes(q)
      ? [node]
      : children.length ? [{ ...node, children }] : [];
  });
}

export function dependencyLayers(tasks: MilestoneTask[], edges: TaskDependencyEdge[]) {
  const remaining = new Set(tasks.map((task) => task.id));
  const prerequisites = new Map(tasks.map((task) => [task.id, new Set<string>()]));
  for (const edge of edges) if (remaining.has(edge.from) && remaining.has(edge.to)) prerequisites.get(edge.to)!.add(edge.from);
  const layers: MilestoneTask[][] = [];
  while (remaining.size) {
    const layer = tasks.filter((task) => remaining.has(task.id) && prerequisites.get(task.id)!.size === 0);
    if (!layer.length) break;
    layers.push(layer);
    for (const task of layer) remaining.delete(task.id);
    for (const ids of prerequisites.values()) for (const task of layer) ids.delete(task.id);
  }
  return { layers, unresolved: tasks.filter((task) => remaining.has(task.id)) };
}

export function milestonePlanningUrl(projectId: string, milestoneId?: string) {
  const query = new URLSearchParams({ planning: "milestone", projectId });
  if (milestoneId && milestoneId !== UNGROUPED_MILESTONE) query.set("milestoneId", milestoneId);
  return `/ai?${query}`;
}

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, users, type MilestoneStatus, type TaskStatus } from "@/db/schema";
import { isOverdue, todayISO } from "@/modules/core";
import { requireProjectForUser } from "@/modules/core/permissions";
import { listMilestones } from "@/modules/milestone";

export type ProgressStatusCounts = Record<TaskStatus, number>;

export type ProgressMilestone = {
  id: string | null;
  title: string;
  targetDate: string | null;
  status: MilestoneStatus | null;
  accepted: number;
  total: number;
  overdue: number;
};

export type ProgressWeek = {
  weekStart: string;
  label: string;
  count: number;
};

export type ProgressRisk = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  assigneeName: string | null;
};

export type ProjectProgress = {
  total: number;
  accepted: number;
  ratio: number;
  subtaskTotal: number;
  subtaskAccepted: number;
  statusCounts: ProgressStatusCounts;
  active: number;
  overdue: number;
  attention: number;
  risks: ProgressRisk[];
  milestones: ProgressMilestone[];
  weeks: ProgressWeek[];
};

function startOfWeek(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function weekLabel(value: Date): string {
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function recentWeeks(acceptedDates: Date[]): ProgressWeek[] {
  const current = startOfWeek(new Date());
  const weeks: ProgressWeek[] = [];
  for (let offset = 7; offset >= 0; offset -= 1) {
    const start = new Date(current);
    start.setDate(start.getDate() - offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = acceptedDates.filter((date) => date >= start && date < end).length;
    weeks.push({ weekStart: todayISO(start), label: weekLabel(start), count });
  }
  return weeks;
}

/**
 * Project progress is reported by top-level task acceptance, matching
 * projectCompletion. Subtasks are reported separately so their acceptance
 * never inflates the project percentage.
 */
export async function projectProgress(
  actorId: string,
  projectId: string,
): Promise<ProjectProgress> {
  await requireProjectForUser(actorId, projectId);
  const [rows, milestones] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        milestoneId: tasks.milestoneId,
        parentTaskId: tasks.parentTaskId,
        assigneeName: users.name,
        acceptedAt: tasks.acceptedAt,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.projectId, projectId)),
    listMilestones(actorId, projectId),
  ]);

  const topLevel = rows.filter((row) => row.parentTaskId === null);
  const subtasks = rows.filter((row) => row.parentTaskId !== null);
  const today = todayISO();
  const statusCounts: ProgressStatusCounts = {
    unclaimed: 0,
    in_progress: 0,
    submitted: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const task of topLevel) statusCounts[task.status] += 1;

  const accepted = statusCounts.accepted;
  const active = statusCounts.in_progress + statusCounts.submitted;
  const overdue = topLevel.filter(
    (task) => task.status !== "accepted" && isOverdue(task.dueDate, today),
  ).length;
  const attention = topLevel.filter(
    (task) =>
      task.status !== "accepted" &&
      (task.status === "rejected" || isOverdue(task.dueDate, today)),
  ).length;
  const risks = topLevel
    .filter(
      (task) =>
        task.status !== "accepted" &&
        (task.status === "rejected" || isOverdue(task.dueDate, today)),
    )
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      assigneeName: task.assigneeName,
    }));

  const milestoneProgress: ProgressMilestone[] = milestones.map((milestone) => {
    const grouped = topLevel.filter((task) => task.milestoneId === milestone.id);
    return {
      id: milestone.id,
      title: milestone.title,
      targetDate: milestone.targetDate,
      status: milestone.status,
      accepted: grouped.filter((task) => task.status === "accepted").length,
      total: grouped.length,
      overdue: grouped.filter(
        (task) => task.status !== "accepted" && isOverdue(task.dueDate, today),
      ).length,
    };
  });
  const ungrouped = topLevel.filter((task) => task.milestoneId === null);
  if (ungrouped.length) {
    milestoneProgress.push({
      id: null,
      title: "未关联里程碑",
      targetDate: null,
      status: null,
      accepted: ungrouped.filter((task) => task.status === "accepted").length,
      total: ungrouped.length,
      overdue: ungrouped.filter(
        (task) => task.status !== "accepted" && isOverdue(task.dueDate, today),
      ).length,
    });
  }

  const acceptedDates = topLevel
    .filter((task) => task.status === "accepted" && task.acceptedAt)
    .map((task) => task.acceptedAt as Date);

  return {
    total: topLevel.length,
    accepted,
    ratio: topLevel.length ? accepted / topLevel.length : 0,
    subtaskTotal: subtasks.length,
    subtaskAccepted: subtasks.filter((task) => task.status === "accepted").length,
    statusCounts,
    active,
    overdue,
    attention,
    risks,
    milestones: milestoneProgress,
    weeks: recentWeeks(acceptedDates),
  };
}

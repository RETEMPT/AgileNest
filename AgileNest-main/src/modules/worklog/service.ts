import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks, users, worklogs } from "@/db/schema";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core/errors";
import { isOverdue } from "@/modules/core/dates";
import {
  getProjectForUser,
  requireProjectForUser,
} from "@/modules/core/permissions";
import { listTeamMembers } from "@/modules/identity";
import { listProjectTasks, type TaskDTO } from "@/modules/tasks";

export type WorklogDTO = {
  id: string;
  taskId: string;
  userId: string;
  userName: string | null;
  workDate: string;
  minutes: number;
  note: string | null;
  createdAt: Date;
};

export type Completion = {
  taskId: string;
  done: number;
  total: number;
  /** 0..1；项目统计按顶层验收，任务统计按直接子任务验收。 */
  ratio: number;
};

export type HoursRollup = {
  userId: string;
  userName: string | null;
  minutes: number;
};

export type Contribution = {
  userId: string;
  userName: string | null;
  tasksAccepted: number;
  tasksSubmitted: number;
  tasksTotal: number;
  statusCounts: Record<TaskDTO["status"], number>;
  completionRatio: number;
  overdue: number;
  tasks: Pick<TaskDTO, "id" | "title" | "status" | "dueDate" | "parentTaskId">[];
};

function toDTO(
  row: typeof worklogs.$inferSelect & { userName?: string | null },
): WorklogDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    userName: row.userName ?? null,
    workDate: row.workDate,
    minutes: row.minutes,
    note: row.note,
    createdAt: row.createdAt,
  };
}

async function loadTaskForWorklog(actorId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();
  return { task, access };
}

export async function addWorklog(
  actorId: string,
  taskId: string,
  input: { workDate: string; minutes: number; note?: string },
): Promise<WorklogDTO> {
  await loadTaskForWorklog(actorId, taskId);
  void input;
  throw new AppError("工时登记已停用，请在贡献页查看任务完成情况", 410);
}

export async function listWorklogs(
  actorId: string,
  taskId: string,
): Promise<WorklogDTO[]> {
  await loadTaskForWorklog(actorId, taskId);
  const rows = await db
    .select({ ...getTableColumns(worklogs), userName: users.name })
    .from(worklogs)
    .leftJoin(users, eq(worklogs.userId, users.id))
    .where(eq(worklogs.taskId, taskId))
    .orderBy(sql`${worklogs.workDate} desc`);
  return rows.map(toDTO);
}

export async function deleteWorklog(
  actorId: string,
  worklogId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(worklogs)
    .where(eq(worklogs.id, worklogId));
  if (!row) throw new NotFoundError("工时记录不存在");
  await loadTaskForWorklog(actorId, row.taskId);
  throw new AppError("工时记录已归档，不能删除", 410);
}

export async function completionRatio(
  actorId: string,
  taskId: string,
): Promise<Completion> {
  const { task } = await loadTaskForWorklog(actorId, taskId);
  const subs = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.parentTaskId, taskId));

  if (subs.length === 0) {
    const done = task.status === "accepted" ? 1 : 0;
    return { taskId, done, total: 1, ratio: done };
  }
  const done = subs.filter((s) => s.status === "accepted").length;
  return { taskId, done, total: subs.length, ratio: done / subs.length };
}

export async function projectCompletion(
  actorId: string,
  projectId: string,
): Promise<Completion> {
  await requireProjectForUser(actorId, projectId);
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'accepted')`.mapWith(
        Number,
      ),
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId)));

  return {
    taskId: projectId,
    done: counts.done,
    total: counts.total,
    ratio: counts.total ? counts.done / counts.total : 0,
  };
}

export async function taskHours(
  actorId: string,
  projectId: string,
  range?: { from?: string; to?: string },
): Promise<HoursRollup[]> {
  await requireProjectForUser(actorId, projectId);
  const conds = [eq(tasks.projectId, projectId)];
  if (range?.from) conds.push(sql`${worklogs.workDate} >= ${range.from}`);
  if (range?.to) conds.push(sql`${worklogs.workDate} <= ${range.to}`);

  const rows = await db
    .select({
      userId: worklogs.userId,
      userName: users.name,
      minutes: sql<number>`coalesce(sum(${worklogs.minutes}), 0)`.mapWith(
        Number,
      ),
    })
    .from(worklogs)
    .innerJoin(tasks, eq(worklogs.taskId, tasks.id))
    .leftJoin(users, eq(worklogs.userId, users.id))
    .where(and(...conds))
    .groupBy(worklogs.userId, users.name);

  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    minutes: r.minutes,
  }));
}

export async function memberContribution(
  actorId: string,
  projectId: string,
): Promise<Contribution[]> {
  const access = await requireProjectForUser(actorId, projectId);
  const [members, projectTasks] = await Promise.all([
    listTeamMembers(actorId, access.project.teamId),
    listProjectTasks(actorId, projectId),
  ]);
  return members
    .filter((member) => access.capabilities.review || member.id === actorId)
    .map((member) => {
      const assigned = projectTasks.filter((task) => task.assigneeId === member.id);
      const statusCounts: Contribution["statusCounts"] = {
        unclaimed: 0, in_progress: 0, submitted: 0, accepted: 0, rejected: 0,
      };
      for (const task of assigned) statusCounts[task.status] += 1;
      return {
        userId: member.id,
        userName: member.name,
        tasksAccepted: statusCounts.accepted,
        tasksSubmitted: statusCounts.submitted,
        tasksTotal: assigned.length,
        statusCounts,
        completionRatio: assigned.length ? statusCounts.accepted / assigned.length : 0,
        overdue: assigned.filter((task) => task.status !== "accepted" && isOverdue(task.dueDate)).length,
        tasks: assigned.map(({ id, title, status, dueDate, parentTaskId }) => ({ id, title, status, dueDate, parentTaskId })),
      };
    });
}

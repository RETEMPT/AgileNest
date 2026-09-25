import { and, eq, getTableColumns, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks, teamMembers, users, worklogs } from "@/db/schema";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core/errors";
import { isValidISODate } from "@/modules/core/dates";
import { getProjectForUser, requireProjectForUser } from "@/modules/core/permissions";

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
  /** 0..1，含子任务加权 */
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
  minutes: number;
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
  const { task } = await loadTaskForWorklog(actorId, taskId);
  if (!isValidISODate(input.workDate)) throw new AppError("日期需为 YYYY-MM-DD");
  if (!Number.isInteger(input.minutes) || input.minutes <= 0) {
    throw new AppError("工时需为正整数（分钟）");
  }
  if (input.minutes > 24 * 60) throw new AppError("单条工时不能超过 24 小时");
  if (task.assigneeId && task.assigneeId !== actorId) {
    throw new ForbiddenError("只能给自己的任务记工时");
  }

  const [row] = await db
    .insert(worklogs)
    .values({
      taskId,
      userId: actorId,
      workDate: input.workDate,
      minutes: input.minutes,
      note: input.note ?? null,
    })
    .returning();
  return toDTO(row);
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
  const { access } = await loadTaskForWorklog(actorId, row.taskId);
  if (row.userId !== actorId && access.role !== "admin") {
    throw new ForbiddenError("只能删除自己的工时");
  }
  await db.delete(worklogs).where(eq(worklogs.id, worklogId));
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
  const tops = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId)));

  if (tops.length === 0) {
    return { taskId: projectId, done: 0, total: 0, ratio: 0 };
  }

  let done = 0;
  for (const t of tops) {
    const c = await completionRatio(actorId, t.id);
    done += c.ratio;
  }
  return {
    taskId: projectId,
    done: Math.round(done),
    total: tops.length,
    ratio: done / tops.length,
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
      minutes: sql<number>`coalesce(sum(${worklogs.minutes}), 0)`.mapWith(Number),
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
  const members = await db
    .select({ userId: teamMembers.userId, userName: users.name })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, access.project.teamId));

  const accepted = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "accepted")))
    .groupBy(tasks.assigneeId);

  const submitted = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNotNull(tasks.submittedAt)))
    .groupBy(tasks.assigneeId);

  const hours = await taskHours(actorId, projectId);
  const accMap = new Map(accepted.map((r) => [r.assigneeId, r.n]));
  const subMap = new Map(submitted.map((r) => [r.assigneeId, r.n]));
  const hourMap = new Map(hours.map((r) => [r.userId, r.minutes]));

  return members.map((m) => ({
    userId: m.userId,
    userName: m.userName,
    tasksAccepted: accMap.get(m.userId) ?? 0,
    tasksSubmitted: subMap.get(m.userId) ?? 0,
    minutes: hourMap.get(m.userId) ?? 0,
  }));
}

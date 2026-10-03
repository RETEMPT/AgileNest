import { and, asc, eq, getTableColumns, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { taskAcceptanceEvents, tasks, users } from "@/db/schema";
import { NotFoundError } from "@/modules/core/errors";
import { isOverdue, todayISO } from "@/modules/core/dates";
import { requireProjectForUser, requireReviewer } from "@/modules/core/permissions";
import { listProjectTasks, toDTO, type TaskDTO, type TaskRow } from "@/modules/tasks";

export type ReviewItem = TaskDTO & {
  submitterName: string | null;
  submittedAt: Date | null;
  completionNote: string | null;
};

export type EventDTO = {
  id: string;
  taskId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  note: string | null;
  createdAt: Date;
};

const taskSelect = {
  ...getTableColumns(tasks),
  assigneeName: users.name,
};

function toReviewItem(row: TaskRow): ReviewItem {
  return {
    ...toDTO(row),
    submitterName: row.assigneeName,
    submittedAt: row.submittedAt,
    completionNote: row.completionNote,
  };
}

/** 学生工作台「待认领」：我可见项目里的任务池 */
export async function listMyTodo(actorId: string): Promise<TaskDTO[]> {
  const all = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.status, "unclaimed"), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));

  const visible: TaskDTO[] = [];
  for (const row of all) {
    try {
      await requireProjectForUser(actorId, row.projectId);
      visible.push(toDTO(row));
    } catch {
      // 非本项目成员
    }
  }
  return visible;
}

export async function listMyInProgress(actorId: string): Promise<TaskDTO[]> {
  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.assigneeId, actorId), eq(tasks.status, "in_progress")))
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
  return rows.map(toDTO);
}

export async function listMyRejected(actorId: string): Promise<TaskDTO[]> {
  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.assigneeId, actorId), eq(tasks.status, "rejected")))
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
  return rows.map(toDTO);
}

export async function listUnclaimedPool(
  actorId: string,
  projectId: string,
): Promise<TaskDTO[]> {
  return listProjectTasks(actorId, projectId, {
    status: ["unclaimed"],
    parentTaskId: null,
  });
}

export async function listPendingReview(
  actorId: string,
  projectId: string,
): Promise<ReviewItem[]> {
  await requireReviewer(actorId, projectId);
  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "submitted")))
    .orderBy(asc(tasks.submittedAt));
  return rows.map(toReviewItem);
}

export async function listOverdueRisks(
  actorId: string,
  projectId: string,
): Promise<TaskDTO[]> {
  await requireProjectForUser(actorId, projectId);
  const today = todayISO();
  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNotNull(tasks.dueDate),
        or(
          eq(tasks.status, "in_progress"),
          eq(tasks.status, "submitted"),
          eq(tasks.status, "rejected"),
        ),
      ),
    );
  return rows.map(toDTO).filter((t) => isOverdue(t.dueDate, today));
}

export async function listTaskEvents(
  actorId: string,
  taskId: string,
): Promise<EventDTO[]> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  await requireProjectForUser(actorId, task.projectId);

  const rows = await db
    .select({
      id: taskAcceptanceEvents.id,
      taskId: taskAcceptanceEvents.taskId,
      actorId: taskAcceptanceEvents.actorId,
      actorName: users.name,
      action: taskAcceptanceEvents.action,
      note: taskAcceptanceEvents.note,
      createdAt: taskAcceptanceEvents.createdAt,
    })
    .from(taskAcceptanceEvents)
    .leftJoin(users, eq(taskAcceptanceEvents.actorId, users.id))
    .where(eq(taskAcceptanceEvents.taskId, taskId))
    .orderBy(asc(taskAcceptanceEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

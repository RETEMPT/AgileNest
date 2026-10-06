import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  taskAcceptanceEvents,
  tasks,
  users,
  projects,
  teamMembers,
  memberPositions,
} from "@/db/schema";
import { NotFoundError } from "@/modules/core/errors";
import { isOverdue, todayISO } from "@/modules/core/dates";
import {
  requireProjectForUser,
  requireReviewer,
} from "@/modules/core/permissions";
import {
  listProjectTasks,
  toDTO,
  type TaskDTO,
  type TaskRow,
} from "@/modules/tasks";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";

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

export async function getWorkbench(actorId: string) {
  // 成员关联本身就是访问边界，避免先扫描全库任务再逐个查权限。
  const rows = await db
    .select({
      ...taskSelect,
      projectName: projects.name,
      kind: projects.kind,
      role: teamMembers.role,
      positions: memberPositions.positions,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, projects.teamId),
        eq(teamMembers.userId, actorId),
      ),
    )
    .leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        eq(projects.status, "active"),
        inArray(tasks.status, [
          "unclaimed",
          "in_progress",
          "rejected",
          "submitted",
        ]),
        or(
          eq(tasks.assigneeId, actorId),
          eq(tasks.status, "submitted"),
          and(eq(tasks.status, "unclaimed"), isNull(tasks.parentTaskId)),
        ),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
  const visible = rows.map((row) => {
    const capabilities = capabilitiesFor(
      row.positions ?? positionsFromRole(row.role),
      row.kind,
    );
    return {
      ...toDTO(row),
      projectName: row.projectName,
      role: row.role,
      permissions: capabilities.task,
      canExecute: capabilities.execute,
      canReview: capabilities.review,
    };
  });
  return {
    mine: visible.filter((task) => task.assigneeId === actorId),
    review: visible.filter(
      (task) => task.status === "submitted" && task.canReview,
    ),
    pool: visible.filter(
      (task) => task.status === "unclaimed" && task.canExecute,
    ),
  };
}

export async function listMyTodo(actorId: string): Promise<TaskDTO[]> {
  return (await getWorkbench(actorId)).pool;
}
export async function listMyInProgress(actorId: string): Promise<TaskDTO[]> {
  return (await getWorkbench(actorId)).mine.filter(
    (task) => task.status === "in_progress",
  );
}
export async function listMyRejected(actorId: string): Promise<TaskDTO[]> {
  return (await getWorkbench(actorId)).mine.filter(
    (task) => task.status === "rejected",
  );
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
  const access = await requireReviewer(actorId, projectId);
  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "submitted")))
    .orderBy(asc(tasks.submittedAt));
  return rows.map((row) => ({
    ...toReviewItem(row),
    permissions: access.capabilities.task,
  }));
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

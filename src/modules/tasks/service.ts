import { and, asc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  taskAcceptanceEvents,
  tasks,
  teamMembers,
  users,
  type TaskAction,
  type TaskPriority,
  type TaskStatus,
} from "@/db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/modules/core/errors";
import { isValidISODate } from "@/modules/core/dates";
import { requireProjectForUser } from "@/modules/core/permissions";
import {
  notifyAccepted,
  notifyAssigned,
  notifyRejected,
  notifySubmitted,
} from "@/modules/notify";
import { ACTION_ROLES, findTransition } from "./states";

export type TaskDTO = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  completionNote: string | null;
  rejectReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskPatch = {
  title?: string;
  description?: string | null;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  priority?: TaskPriority;
  sortOrder?: number;
};

export type TransitionInput = {
  note?: string;
  assigneeId?: string;
};

export type TransitionAction =
  | "claim"
  | "unclaim"
  | "assign"
  | "submit"
  | "resubmit"
  | "accept"
  | "reject"
  | "reopen";

export type TaskRow = typeof tasks.$inferSelect & { assigneeName: string | null };

const taskSelect = {
  ...getTableColumns(tasks),
  assigneeName: users.name,
};

export function toDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    completionNote: row.completionNote,
    rejectReason: row.rejectReason,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdById: row.createdById,
    startDate: row.startDate,
    dueDate: row.dueDate,
    estimatedMinutes: row.estimatedMinutes,
    status: row.status,
    priority: row.priority,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadTaskRow(taskId: string): Promise<TaskRow> {
  const [row] = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new NotFoundError("任务不存在");
  return row;
}

async function assertRole(actorId: string, projectId: string, action: TaskAction) {
  const access = await requireProjectForUser(actorId, projectId);
  if (!ACTION_ROLES[action].includes(access.role)) throw new ForbiddenError();
  return access;
}

async function recordEvent(
  taskId: string,
  actorId: string | null,
  action: TaskAction,
  note?: string | null,
) {
  await db.insert(taskAcceptanceEvents).values({
    taskId,
    actorId,
    action,
    note: note ?? null,
  });
}

function assertISODate(value: string | null | undefined, field: string) {
  if (value != null && !isValidISODate(value)) {
    throw new AppError(`${field}需为 YYYY-MM-DD`);
  }
}

async function fireNotify(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    // 通知失败不阻断业务
  }
}

export async function listProjectTasks(
  actorId: string,
  projectId: string,
  filters?: {
    status?: TaskStatus[];
    assigneeId?: string;
    milestoneId?: string;
    parentTaskId?: string | null;
  },
): Promise<TaskDTO[]> {
  await requireProjectForUser(actorId, projectId);
  const conds = [eq(tasks.projectId, projectId)];
  if (filters?.status?.length) conds.push(inArray(tasks.status, filters.status));
  if (filters?.assigneeId) conds.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters?.milestoneId) conds.push(eq(tasks.milestoneId, filters.milestoneId));
  if (filters?.parentTaskId === null) conds.push(isNull(tasks.parentTaskId));
  else if (filters?.parentTaskId) conds.push(eq(tasks.parentTaskId, filters.parentTaskId));

  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...conds))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
  return rows.map(toDTO);
}

export async function getTaskDetail(
  actorId: string,
  taskId: string,
): Promise<TaskDTO & { subtasks: TaskDTO[] }> {
  const row = await loadTaskRow(taskId);
  await requireProjectForUser(actorId, row.projectId);
  const subtasks = await listProjectTasks(actorId, row.projectId, {
    parentTaskId: taskId,
  });
  return { ...toDTO(row), subtasks };
}

export async function createTask(
  actorId: string,
  projectId: string,
  input: {
    title: string;
    description?: string;
    assigneeId?: string;
    milestoneId?: string;
    parentTaskId?: string;
    startDate?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: TaskPriority;
  },
): Promise<TaskDTO> {
  const access = await assertRole(actorId, projectId, "create");
  const title = input.title?.trim();
  if (!title) throw new AppError("标题不能为空");
  assertISODate(input.startDate, "开始日期");
  assertISODate(input.dueDate, "截止日期");

  if (input.assigneeId) {
    const [member] = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, access.project.teamId),
          eq(teamMembers.userId, input.assigneeId),
        ),
      );
    if (!member) throw new AppError("指派对象不在团队中");
  }

  const [row] = await db
    .insert(tasks)
    .values({
      projectId,
      title,
      description: input.description ?? null,
      assigneeId: input.assigneeId ?? null,
      createdById: actorId,
      milestoneId: input.milestoneId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      priority: input.priority ?? "medium",
      status: input.assigneeId ? "in_progress" : "unclaimed",
      claimedAt: input.assigneeId ? new Date() : null,
    })
    .returning();

  await recordEvent(row.id, actorId, "create");
  if (input.assigneeId) {
    await recordEvent(row.id, actorId, "assign", input.assigneeId);
    await fireNotify(() => notifyAssigned(row.id));
  }
  return toDTO({ ...row, assigneeName: null });
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
): Promise<TaskDTO> {
  const row = await loadTaskRow(taskId);
  await assertRole(actorId, row.projectId, "update");
  assertISODate(patch.startDate, "开始日期");
  assertISODate(patch.dueDate, "截止日期");

  const [updated] = await db
    .update(tasks)
    .set({
      ...(patch.title !== undefined && { title: patch.title.trim() }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.milestoneId !== undefined && { milestoneId: patch.milestoneId }),
      ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId }),
      ...(patch.startDate !== undefined && { startDate: patch.startDate }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
      ...(patch.estimatedMinutes !== undefined && {
        estimatedMinutes: patch.estimatedMinutes,
      }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  await recordEvent(taskId, actorId, "update");
  return toDTO({ ...updated, assigneeName: row.assigneeName });
}

export async function deleteTask(actorId: string, taskId: string): Promise<void> {
  const row = await loadTaskRow(taskId);
  await assertRole(actorId, row.projectId, "delete");
  await recordEvent(taskId, actorId, "delete");
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function transitionTask(
  actorId: string,
  taskId: string,
  action: TransitionAction,
  input?: TransitionInput,
): Promise<TaskDTO> {
  const row = await loadTaskRow(taskId);
  const access = await assertRole(actorId, row.projectId, action);
  const rule = findTransition(action, row.status);
  if (!rule) throw new ConflictError();

  const note = input?.note?.trim() || null;
  if (rule.noteRequired && !note) throw new AppError("请填写说明");

  if (action === "submit" || action === "resubmit") {
    if (!row.assigneeId) throw new ForbiddenError("任务尚未认领");
    if (row.assigneeId !== actorId && access.role === "student") {
      throw new ForbiddenError("只有认领人可以提交");
    }
  }
  if (action === "unclaim" && access.role === "student" && row.assigneeId !== actorId) {
    throw new ForbiddenError("只能退回自己的任务");
  }

  let nextAssignee = row.assigneeId;
  if (action === "claim") nextAssignee = actorId;
  else if (action === "unclaim") nextAssignee = null;
  else if (action === "assign") {
    const target = input?.assigneeId;
    if (!target) throw new AppError("请选择指派对象");
    const [member] = await db
      .select({ id: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, access.project.teamId),
          eq(teamMembers.userId, target),
        ),
      );
    if (!member) throw new AppError("指派对象不在团队中");
    nextAssignee = target;
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: rule.to,
      assigneeId: nextAssignee,
      completionNote:
        action === "submit" || action === "resubmit" ? note : row.completionNote,
      rejectReason: action === "reject" ? note : row.rejectReason,
      claimedAt:
        action === "claim" || action === "assign"
          ? now
          : action === "unclaim"
            ? null
            : row.claimedAt,
      submittedAt:
        action === "submit" || action === "resubmit"
          ? now
          : action === "unclaim"
            ? null
            : row.submittedAt,
      acceptedAt:
        action === "accept"
          ? now
          : action === "reopen" || action === "unclaim"
            ? null
            : row.acceptedAt,
      acceptedById:
        action === "accept"
          ? actorId
          : action === "reopen" || action === "unclaim"
            ? null
            : row.acceptedById,
      rejectedAt:
        action === "reject"
          ? now
          : action === "resubmit" || action === "unclaim" || action === "reopen"
            ? null
            : row.rejectedAt,
      rejectedById:
        action === "reject"
          ? actorId
          : action === "resubmit" || action === "unclaim" || action === "reopen"
            ? null
            : row.rejectedById,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  await recordEvent(taskId, actorId, action, note);

  if (action === "claim" || action === "assign") {
    await fireNotify(() => notifyAssigned(taskId));
  } else if (action === "submit" || action === "resubmit") {
    await fireNotify(() => notifySubmitted(taskId));
  } else if (action === "accept") {
    await fireNotify(() => notifyAccepted(taskId));
  } else if (action === "reject") {
    await fireNotify(() => notifyRejected(taskId, note ?? ""));
  }

  return toDTO(await loadTaskRow(taskId));
}

export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: { title: string; description?: string; dueDate?: string },
): Promise<TaskDTO> {
  const parent = await loadTaskRow(parentTaskId);
  if (parent.parentTaskId) throw new AppError("不能再嵌套子任务");
  return createTask(actorId, parent.projectId, {
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    parentTaskId,
  });
}

export async function listSubtasks(
  actorId: string,
  parentTaskId: string,
): Promise<TaskDTO[]> {
  const parent = await loadTaskRow(parentTaskId);
  return listProjectTasks(actorId, parent.projectId, { parentTaskId });
}

export async function setDueDate(
  actorId: string,
  taskId: string,
  dueDate: string | null,
): Promise<TaskDTO> {
  return updateTask(actorId, taskId, { dueDate });
}

/** calendar / notify：区间内未完成且有截止日的任务 */
export async function listOpenTasksDueBetween(fromISO: string, toISO: string) {
  return db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        or(
          eq(tasks.status, "in_progress"),
          eq(tasks.status, "submitted"),
          eq(tasks.status, "rejected"),
        ),
        isNotNull(tasks.dueDate),
        gte(tasks.dueDate, fromISO),
        lte(tasks.dueDate, toISO),
      ),
    )
    .orderBy(asc(tasks.dueDate));
}

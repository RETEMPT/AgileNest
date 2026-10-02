import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { tasks, users, type TaskPriority, type TaskStatus } from "@/db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/modules/core/errors";
import {
  requireProjectForUser,
  requireReviewer,
  requireTaskWrite,
} from "@/modules/core/permissions";

import { ACTION_ROLES, findTransition } from "./states";
import type {
  TaskDTO,
  TaskPatch,
  TransitionAction,
  TransitionInput,
} from "./types";

function toDTO(row: typeof tasks.$inferSelect, assigneeName: string | null): TaskDTO {
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
    assigneeName,
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

async function getDTO(taskId: string): Promise<TaskDTO | null> {
  const [row] = await db
    .select({ task: tasks, assigneeName: users.name })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, taskId));
  return row ? toDTO(row.task, row.assigneeName) : null;
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

  const conditions = [eq(tasks.projectId, projectId)];
  if (filters?.status?.length) conditions.push(inArray(tasks.status, filters.status));
  if (filters?.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters?.milestoneId) conditions.push(eq(tasks.milestoneId, filters.milestoneId));
  if (filters?.parentTaskId !== undefined) {
    conditions.push(
      filters.parentTaskId === null
        ? isNull(tasks.parentTaskId)
        : eq(tasks.parentTaskId, filters.parentTaskId),
    );
  }

  const rows = await db
    .select({ task: tasks, assigneeName: users.name })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));

  return rows.map((r) => toDTO(r.task, r.assigneeName));
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
  // create 允许三种角色，任意项目成员即可
  await requireProjectForUser(actorId, projectId);

  const [row] = await db
    .insert(tasks)
    .values({
      projectId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      milestoneId: input.milestoneId,
      parentTaskId: input.parentTaskId,
      startDate: input.startDate,
      dueDate: input.dueDate,
      estimatedMinutes: input.estimatedMinutes,
      priority: input.priority,
      createdById: actorId,
    })
    .returning();

  return toDTO(row, null);
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
): Promise<TaskDTO> {
  const existing = await getDTO(taskId);
  if (!existing) throw new NotFoundError("任务不存在");
  await requireTaskWrite(actorId, existing.projectId);

  await db
    .update(tasks)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.milestoneId !== undefined && { milestoneId: patch.milestoneId }),
      ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId }),
      ...(patch.startDate !== undefined && { startDate: patch.startDate }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
      ...(patch.estimatedMinutes !== undefined && { estimatedMinutes: patch.estimatedMinutes }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return (await getDTO(taskId))!;
}

export async function deleteTask(actorId: string, taskId: string): Promise<void> {
  const existing = await getDTO(taskId);
  if (!existing) throw new NotFoundError("任务不存在");
  await requireReviewer(actorId, existing.projectId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function transitionTask(
  actorId: string,
  taskId: string,
  action: TransitionAction,
  input?: TransitionInput,
): Promise<TaskDTO> {
  const existing = await getDTO(taskId);
  if (!existing) throw new NotFoundError("任务不存在");

  const access = await requireProjectForUser(actorId, existing.projectId);

  if (!ACTION_ROLES[action].includes(access.role)) throw new ForbiddenError();

  const rule = findTransition(action, existing.status);
  if (!rule) throw new ConflictError();

  // selfOnly 仅在有负责人且负责人非本人时拦截；claim 时任务尚无人认领，跳过该检查
  if (rule.selfOnly && existing.assigneeId !== null && existing.assigneeId !== actorId) {
    throw new ForbiddenError("只有任务负责人可执行该操作");
  }

  const note = input?.note?.trim();
  if (rule.noteRequired && !note) throw new AppError("需要填写说明");

  if (action === "assign" && !input?.assigneeId) throw new AppError("请选择负责人");

  const now = new Date();
  const values: Partial<typeof tasks.$inferInsert> = {
    status: rule.to,
    updatedAt: now,
  };

  switch (action) {
    case "claim":
      values.assigneeId = actorId;
      values.claimedAt = now;
      break;
    case "unclaim":
      values.assigneeId = null;
      values.claimedAt = null;
      break;
    case "assign":
      values.assigneeId = input!.assigneeId;
      values.claimedAt = now;
      break;
    case "submit":
      values.completionNote = note ?? null;
      values.submittedAt = now;
      break;
    case "resubmit":
      values.completionNote = note ?? null;
      values.rejectReason = null;
      values.submittedAt = now;
      break;
    case "accept":
      values.acceptedById = actorId;
      values.acceptedAt = now;
      break;
    case "reject":
      values.rejectReason = note ?? null;
      values.rejectedById = actorId;
      values.rejectedAt = now;
      break;
    case "reopen":
      values.acceptedById = null;
      values.acceptedAt = null;
      break;
  }

  await db.update(tasks).set(values).where(eq(tasks.id, taskId));

  return (await getDTO(taskId))!;
}

// —— 任务详情页 / 子任务 ——
export async function getTaskDetail(
  actorId: string,
  taskId: string,
): Promise<TaskDTO & { subtasks: TaskDTO[] }> {
  const task = await getDTO(taskId);
  if (!task) throw new NotFoundError("任务不存在");
  await requireProjectForUser(actorId, task.projectId);
  const subtasks = await listProjectTasks(actorId, task.projectId, { parentTaskId: taskId });
  return { ...task, subtasks };
}

export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: { title: string; description?: string; dueDate?: string },
): Promise<TaskDTO> {
  const parent = await getDTO(parentTaskId);
  if (!parent) throw new NotFoundError("父任务不存在");
  await requireProjectForUser(actorId, parent.projectId);

  const [row] = await db
    .insert(tasks)
    .values({
      projectId: parent.projectId,
      parentTaskId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      createdById: actorId,
    })
    .returning();
  return toDTO(row, null);
}

export async function listSubtasks(
  actorId: string,
  parentTaskId: string,
): Promise<TaskDTO[]> {
  const parent = await getDTO(parentTaskId);
  if (!parent) throw new NotFoundError("父任务不存在");
  await requireProjectForUser(actorId, parent.projectId);
  return listProjectTasks(actorId, parent.projectId, { parentTaskId });
}

export async function setDueDate(
  actorId: string,
  taskId: string,
  dueDate: string | null,
): Promise<TaskDTO> {
  return updateTask(actorId, taskId, { dueDate });
}

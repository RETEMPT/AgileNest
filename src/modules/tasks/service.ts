import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { db, type DbTx } from "@/db";
import {
  taskAcceptanceEvents,
  tasks,
  milestones,
  teamMembers,
  memberPositions,
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
  isValidISODate,
  requireProjectForUser,
} from "@/modules/core";
import {
  notifyAccepted,
  notifyAssigned,
  notifyRejected,
  notifySubmitted,
} from "@/modules/notify";
import { availableTransitions, findTransition } from "./states";
import { taskCreateSchema, taskPatchSchema, assertTaskDates } from "./schema";
import {
  capabilitiesFor,
  positionsFromRole,
  type TaskPermissions,
} from "@/modules/identity/client";

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
  permissions?: TaskPermissions;
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

export type TaskRow = typeof tasks.$inferSelect & {
  assigneeName: string | null;
};

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

function toActorDTO(row: TaskRow, permissions: TaskPermissions): TaskDTO {
  return { ...toDTO(row), permissions };
}

async function loadTaskRow(
  taskId: string,
  connection: DbTx = db,
): Promise<TaskRow> {
  const [row] = await connection
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new NotFoundError("任务不存在");
  return row;
}

async function assertRole(
  actorId: string,
  projectId: string,
  action: TaskAction,
) {
  const access = await requireProjectForUser(actorId, projectId);
  if (!access.capabilities.task.actions.includes(action))
    throw new ForbiddenError();
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
  const access = await requireProjectForUser(actorId, projectId);
  const conds = [eq(tasks.projectId, projectId)];
  if (filters?.status?.length)
    conds.push(inArray(tasks.status, filters.status));
  if (filters?.assigneeId) conds.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters?.milestoneId)
    conds.push(eq(tasks.milestoneId, filters.milestoneId));
  if (filters?.parentTaskId === null) conds.push(isNull(tasks.parentTaskId));
  else if (filters?.parentTaskId)
    conds.push(eq(tasks.parentTaskId, filters.parentTaskId));

  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...conds))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
  return rows.map((row) => toActorDTO(row, access.capabilities.task));
}

export async function getTaskDetail(
  actorId: string,
  taskId: string,
): Promise<TaskDTO & { subtasks: TaskDTO[] }> {
  const row = await loadTaskRow(taskId);
  const access = await requireProjectForUser(actorId, row.projectId);
  const subtasks = await listProjectTasks(actorId, row.projectId, {
    parentTaskId: taskId,
  });
  return { ...toActorDTO(row, access.capabilities.task), subtasks };
}

async function validateTaskLinks(
  tx: DbTx,
  projectId: string,
  milestoneId?: string | null,
  parentId?: string | null,
) {
  if (milestoneId) {
    const [milestone] = await tx
      .select({ projectId: milestones.projectId })
      .from(milestones)
      .where(eq(milestones.id, milestoneId));
    if (!milestone || milestone.projectId !== projectId)
      throw new AppError("请选择当前项目的里程碑");
  }
  if (parentId) {
    const [parent] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, parentId))
      .for("update");
    if (!parent || parent.projectId !== projectId)
      throw new AppError("父任务必须属于当前项目");
    if (parent.parentTaskId)
      throw new ConflictError("子任务不能继续拆分，请在顶层任务中添加");
    if (["submitted", "accepted"].includes(parent.status))
      throw new ConflictError(
        "待验收或已完成的任务不能新增子任务，请先打回或重新打开",
      );
  }
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
  const parsed = taskCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  assertTaskDates(parsed.data);
  const title = input.title?.trim();
  if (!title) throw new AppError("标题不能为空");
  assertISODate(input.startDate, "开始日期");
  assertISODate(input.dueDate, "截止日期");

  if (input.assigneeId) {
    if (
      !access.capabilities.task.actions.includes("assign") &&
      input.assigneeId !== actorId
    )
      throw new ForbiddenError("只能认领自己的任务，请联系有指派权限的成员");
    const [member] = await db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        positions: memberPositions.positions,
      })
      .from(teamMembers)
      .leftJoin(
        memberPositions,
        eq(memberPositions.membershipId, teamMembers.id),
      )
      .where(
        and(
          eq(teamMembers.teamId, access.project.teamId),
          eq(teamMembers.userId, input.assigneeId),
        ),
      );
    if (!member) throw new AppError("指派对象不在团队中");
    if (
      !capabilitiesFor(
        member.positions ?? positionsFromRole(member.role),
        access.project.kind,
      ).execute
    )
      throw new AppError("请选择有队员、队长或管理员职务的成员作为负责人");
  }

  const row = await db.transaction(async (tx) => {
    await validateTaskLinks(
      tx,
      projectId,
      input.milestoneId,
      input.parentTaskId,
    );
    const [created] = await tx
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
    await tx
      .insert(taskAcceptanceEvents)
      .values({ taskId: created.id, actorId, action: "create" });
    if (input.assigneeId)
      await tx.insert(taskAcceptanceEvents).values({
        taskId: created.id,
        actorId,
        action: "assign",
        note: input.assigneeId,
      });
    return created;
  });

  if (input.assigneeId) {
    await fireNotify(() => notifyAssigned(row.id));
  }
  return toActorDTO({ ...row, assigneeName: null }, access.capabilities.task);
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
): Promise<TaskDTO> {
  const row = await loadTaskRow(taskId);
  const access = await assertRole(actorId, row.projectId, "update");
  const parsed = taskPatchSchema.safeParse(patch);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  patch = parsed.data;
  if (
    patch.parentTaskId !== undefined &&
    patch.parentTaskId !== row.parentTaskId
  )
    throw new ConflictError("创建后不能更换父任务，请在目标任务中添加子任务");
  assertISODate(patch.startDate, "开始日期");
  assertISODate(patch.dueDate, "截止日期");

  const updated = await db.transaction(async (tx) => {
    if (row.parentTaskId)
      await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.id, row.parentTaskId))
        .for("update");
    const [current] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    if (!current) throw new NotFoundError("任务不存在");
    assertTaskDates({ ...current, ...patch });
    await validateTaskLinks(tx, row.projectId, patch.milestoneId);
    const [changed] = await tx
      .update(tasks)
      .set({
        ...(patch.title !== undefined && { title: patch.title.trim() }),
        ...(patch.description !== undefined && {
          description: patch.description,
        }),
        ...(patch.milestoneId !== undefined && {
          milestoneId: patch.milestoneId,
        }),
        ...(patch.parentTaskId !== undefined && {
          parentTaskId: patch.parentTaskId,
        }),
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
    await tx
      .insert(taskAcceptanceEvents)
      .values({ taskId, actorId, action: "update", note: "更新任务信息" });
    return changed;
  });
  return toActorDTO(
    { ...updated, assigneeName: row.assigneeName },
    access.capabilities.task,
  );
}

export async function deleteTask(
  actorId: string,
  taskId: string,
): Promise<void> {
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
  const initial = await loadTaskRow(taskId);
  const access = await assertRole(actorId, initial.projectId, action);
  const note = input?.note?.trim() || null;
  const result = await db.transaction(async (tx) => {
    if (initial.parentTaskId) {
      const [parent] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, initial.parentTaskId))
        .for("update");
      if (parent?.status === "accepted" && action === "reopen")
        throw new ConflictError("请先重新打开父任务，再调整子任务");
    }
    await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    const row = await loadTaskRow(taskId, tx);
    const rule = findTransition(action, row.status);
    if (!rule) throw new ConflictError("当前状态无法执行该操作，请刷新后重试");
    if (
      !availableTransitions(
        { ...row, permissions: access.capabilities.task },
        access.role,
        actorId,
      ).includes(rule)
    ) {
      throw new ForbiddenError("只能操作自己认领的任务");
    }

    if (rule.noteRequired && !note) throw new AppError("请填写说明");
    if (note && note.length > 5000) throw new AppError("说明最多 5000 字");
    if (action === "accept") {
      const children = await tx
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.parentTaskId, taskId));
      if (children.some((child) => child.status !== "accepted"))
        throw new ConflictError("请先验收全部子任务，再验收父任务");
    }

    let nextAssignee = row.assigneeId;
    if (action === "claim") nextAssignee = actorId;
    else if (action === "unclaim") nextAssignee = null;
    else if (action === "assign") {
      const target = input?.assigneeId;
      if (!target) throw new AppError("请选择指派对象");
      const [member] = await tx
        .select({
          id: teamMembers.userId,
          role: teamMembers.role,
          positions: memberPositions.positions,
        })
        .from(teamMembers)
        .leftJoin(
          memberPositions,
          eq(memberPositions.membershipId, teamMembers.id),
        )
        .where(
          and(
            eq(teamMembers.teamId, access.project.teamId),
            eq(teamMembers.userId, target),
          ),
        );
      if (!member) throw new AppError("指派对象不在团队中");
      if (
        !capabilitiesFor(
          member.positions ?? positionsFromRole(member.role),
          access.project.kind,
        ).execute
      )
        throw new AppError("请选择有队员、队长或管理员职务的成员作为负责人");
      nextAssignee = target;
    }

    const now = new Date();
    await tx
      .update(tasks)
      .set({
        status: rule.to,
        assigneeId: nextAssignee,
        completionNote:
          action === "submit" || action === "resubmit"
            ? note
            : row.completionNote,
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
            : action === "resubmit" ||
                action === "unclaim" ||
                action === "reopen"
              ? null
              : row.rejectedAt,
        rejectedById:
          action === "reject"
            ? actorId
            : action === "resubmit" ||
                action === "unclaim" ||
                action === "reopen"
              ? null
              : row.rejectedById,
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId));
    await tx
      .insert(taskAcceptanceEvents)
      .values({ taskId, actorId, action, note });
    return toActorDTO(await loadTaskRow(taskId, tx), access.capabilities.task);
  });

  if (action === "claim" || action === "assign") {
    await fireNotify(() => notifyAssigned(taskId));
  } else if (action === "submit" || action === "resubmit") {
    await fireNotify(() => notifySubmitted(taskId));
  } else if (action === "accept") {
    await fireNotify(() => notifyAccepted(taskId));
  } else if (action === "reject") {
    await fireNotify(() => notifyRejected(taskId, note ?? ""));
  }

  return result;
}

export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: {
    title: string;
    description?: string;
    dueDate?: string;
    priority?: TaskPriority;
  },
): Promise<TaskDTO> {
  const parent = await loadTaskRow(parentTaskId);
  await requireProjectForUser(actorId, parent.projectId);
  if (parent.parentTaskId) throw new AppError("不能再嵌套子任务");
  return createTask(actorId, parent.projectId, {
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    priority: input.priority,
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

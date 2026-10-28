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
  sql,
} from "drizzle-orm";
import { db, type DbTx } from "@/db";
import {
  taskAcceptanceEvents,
  taskRequirements,
  deliveryEntries,
  deliveryIssues,
  deliveryRecords,
  taskActionItemOrigins,
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
  enqueueCollaborationNotice,
} from "@/modules/notify";
import { availableTransitions, findTransition } from "./states";
import { taskCreateSchema, taskPatchSchema, assertTaskDates } from "./schema";
import {
  capabilitiesFor,
  positionsFromRole,
  type TaskPermissions,
} from "@/modules/identity/client";
import type { AcceptanceCriterion, DeliveryInput, ReviewInput } from "./delivery-types";
import { writeSubmission, writeReview } from "./delivery";
import { lockTeamTaskAccess } from "./task-locks";
import { assertTaskDependencyDeletion, assertTaskDependencyTransition, loadTaskOrganizationSummaries } from "./organization-service";
import { matchesTaskOrganization, type TaskOrganizationSummary } from "./organization-client";
import { taskActionItemCreateSchema, type TaskActionItemInput, type TaskActionItemOrigin } from "./organization-client";
import { accessibleResourceIds, bindTaskActionItemSource } from "@/modules/resources";

export { getTaskDelivery, saveTaskRequirements } from "./delivery";

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
  labels?: TaskOrganizationSummary["labels"];
  blockedByIds?: string[];
  blockingIds?: string[];
  blocked?: boolean;
  reopenBlocked?: boolean;
  acceptBlocked?: boolean;
  actionItemOrigin?: TaskActionItemOrigin;
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
  delivery?: DeliveryInput;
  review?: ReviewInput;
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

async function withOrganization(task: TaskDTO, actorId: string): Promise<TaskDTO> {
  const summary = (await loadTaskOrganizationSummaries([task.id])).get(task.id)!;
  const origins = await loadActionItemOrigins(actorId, [task.id]);
  const [unfinishedChild] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.parentTaskId, task.id), sql`${tasks.status} <> 'accepted'`)).limit(1);
  return { ...task, ...summary, acceptBlocked: Boolean(unfinishedChild), ...(origins.get(task.id) ? { actionItemOrigin: origins.get(task.id)! } : {}) };
}

async function loadActionItemOrigins(actorId: string, taskIds: string[]) {
  if (!taskIds.length) return new Map<string, TaskActionItemOrigin>();
  const origins = await db.select({ taskId: taskActionItemOrigins.taskId, resourceId: taskActionItemOrigins.resourceId, resourceTitle: taskActionItemOrigins.resourceTitle, sourceVersion: taskActionItemOrigins.sourceVersion, quote: taskActionItemOrigins.quote }).from(taskActionItemOrigins).where(inArray(taskActionItemOrigins.taskId, taskIds));
  const visible = new Set(await accessibleResourceIds(actorId, [...new Set(origins.map((origin) => origin.resourceId))]));
  return new Map(origins.map(({ taskId, ...origin }) => [taskId, visible.has(origin.resourceId) ? { ...origin, accessible: true } : { resourceId: origin.resourceId, sourceVersion: origin.sourceVersion, resourceTitle: null, quote: null, accessible: false }]));
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
    labelId?: string;
    blocked?: boolean;
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
  const organization = await loadTaskOrganizationSummaries(rows.map((row) => row.id));
  const origins = await loadActionItemOrigins(actorId, rows.map((row) => row.id));
  const children = rows.length ? await db.select({ parentId: tasks.parentTaskId }).from(tasks).where(and(inArray(tasks.parentTaskId, rows.map((row) => row.id)), sql`${tasks.status} <> 'accepted'`)) : [];
  const acceptBlockedIds = new Set(children.map((child) => child.parentId));
  return rows.map((row) => ({ ...toActorDTO(row, access.capabilities.task), ...organization.get(row.id)!, acceptBlocked: acceptBlockedIds.has(row.id), ...(origins.get(row.id) ? { actionItemOrigin: origins.get(row.id)! } : {}) }))
    .filter((task) => matchesTaskOrganization(task, filters ?? {}));
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
  return { ...await withOrganization(toActorDTO(row, access.capabilities.task), actorId), subtasks };
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

type TaskCreateInput = {
  title: string; description?: string; assigneeId?: string; milestoneId?: string; parentTaskId?: string;
  startDate?: string; dueDate?: string; estimatedMinutes?: number; priority?: TaskPriority;
  acceptanceCriteria?: AcceptanceCriterion[];
  requestKey?: string;
};

export async function createTask(actorId: string, projectId: string, input: TaskCreateInput): Promise<TaskDTO> {
  const access = await assertRole(actorId, projectId, "create");
  const parsed = taskCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  input = { ...input, acceptanceCriteria: parsed.data.acceptanceCriteria };
  assertTaskDates(parsed.data);
  const title = input.title?.trim();
  if (!title) throw new AppError("标题不能为空");
  assertISODate(input.startDate, "开始日期");
  assertISODate(input.dueDate, "截止日期");

  const row = await db.transaction((tx) => createTaskInTransaction(tx, actorId, projectId, input, access.project.teamId));
  if (input.assigneeId && row.createdNew) await fireNotify(() => notifyAssigned(row.created.id, actorId));
  return withOrganization(toActorDTO({ ...row.created, assigneeName: null }, row.permissions), actorId);
}

async function createTaskInTransaction(tx: DbTx, actorId: string, projectId: string, input: TaskCreateInput, teamId: string) {
    const latestAccess = await lockTeamTaskAccess(tx, actorId, projectId, teamId, "create");
    if (input.requestKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'task:create:' + input.requestKey}))`);
      const [existing] = await tx.select().from(tasks).where(eq(tasks.id, input.requestKey));
      if (existing) {
        if (existing.projectId !== projectId || existing.createdById !== actorId || existing.parentTaskId !== (input.parentTaskId ?? null)) throw new ConflictError("此发布请求已被使用，请重新开始创建任务");
        return { created: existing, permissions: latestAccess.capabilities.task, createdNew: false };
      }
    }
    if (input.assigneeId) {
    if (
      !latestAccess.capabilities.task.actions.includes("assign") &&
      input.assigneeId !== actorId
    )
      throw new ForbiddenError("只能认领自己的任务，请联系有指派权限的成员");
    const [member] = await tx
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
          eq(teamMembers.teamId, latestAccess.project.teamId),
          eq(teamMembers.userId, input.assigneeId),
        ),
      );
    if (!member) throw new AppError("指派对象不在团队中");
    if (
      !capabilitiesFor(
        member.positions ?? positionsFromRole(member.role),
        latestAccess.project.kind,
      ).execute
    )
      throw new AppError("请选择有组员、队长、副管理员或管理员职务的成员作为负责人");
    }
    await validateTaskLinks(
      tx,
      projectId,
      input.milestoneId,
      input.parentTaskId,
    );
    const now = new Date();
    const [created] = await tx
      .insert(tasks)
      .values({
        ...(input.requestKey ? { id: input.requestKey } : {}),
        projectId,
        title: input.title.trim(),
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
        claimedAt: input.assigneeId ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (input.acceptanceCriteria) await tx.insert(taskRequirements).values({ taskId: created.id, version: 1, criteria: input.acceptanceCriteria, updatedAt: now });
    const [createdEvent] = await tx
      .insert(taskAcceptanceEvents)
      .values({ taskId: created.id, actorId, action: "create", createdAt: now }).returning({ id: taskAcceptanceEvents.id });
    if (input.assigneeId)
      await tx.insert(taskAcceptanceEvents).values({
        taskId: created.id,
        actorId,
        action: "assign",
        note: input.assigneeId,
        createdAt: now,
      });
    else await enqueueCollaborationNotice(actorId, { target: { kind: "task", id: created.id }, event: "task_update", eventKey: `created:${createdEvent.id}`, title: `新任务：${created.title}`.slice(0, 200), link: `/p/${projectId}/tasks/${created.id}` }, tx);
    return { created, permissions: latestAccess.capabilities.task, createdNew: true };
}

export async function createTaskActionItem(actorId: string, projectId: string, input: TaskActionItemInput): Promise<TaskDTO> {
  const access = await assertRole(actorId, projectId, "create");
  const parsed = taskActionItemCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const item = parsed.data;
  const row = await db.transaction(async (tx) => {
    const latestAccess = await lockTeamTaskAccess(tx, actorId, projectId, access.project.teamId, "create");
    const [existing] = await tx.select().from(taskActionItemOrigins).where(and(eq(taskActionItemOrigins.resourceId, item.resourceId), eq(taskActionItemOrigins.requestKey, item.requestKey)));
    if (existing) {
      const previous = await loadTaskRow(existing.taskId, tx);
      if (existing.createdById !== actorId || previous.projectId !== projectId) throw new ConflictError("该行动项请求已被使用，请重新创建");
      return toActorDTO(previous, latestAccess.capabilities.task);
    }
    const created = await createTaskInTransaction(tx, actorId, projectId, { title: item.title, description: item.description, dueDate: item.dueDate }, access.project.teamId);
    const source = await bindTaskActionItemSource(actorId, projectId, { resourceId: item.resourceId, sourceVersion: item.sourceVersion, quote: item.quote }, tx);
    await tx.insert(taskActionItemOrigins).values({ taskId: created.created.id, resourceId: source.id, resourceTitle: source.title, sourceVersion: source.version, quote: item.quote || null, requestKey: item.requestKey, createdById: actorId, createdAt: created.created.createdAt });
    await tx.insert(taskAcceptanceEvents).values({ taskId: created.created.id, actorId, action: "update", note: `来自文档「${source.title}」v${source.version}的行动项`, createdAt: created.created.createdAt });
    return toActorDTO({ ...created.created, assigneeName: null }, created.permissions);
  });
  return withOrganization(row, actorId);
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
  expectedUpdatedAt?: string,
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
    const latestAccess = await lockTeamTaskAccess(tx, actorId, row.projectId, access.project.teamId, "update");
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
    if (expectedUpdatedAt !== undefined && current.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictError("任务已被修改，请保留草稿并重新加载核对后再保存");
    if (["submitted", "accepted"].includes(current.status) && ((patch.title !== undefined && patch.title !== current.title) || (patch.description !== undefined && (patch.description ?? "") !== (current.description ?? "")))) throw new ConflictError("待验收或已完成的任务不能更改工作目标，请先打回或重新打开；排期与优先级仍可调整");
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
        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      })
      .where(eq(tasks.id, taskId))
      .returning();
    const [event] = await tx
      .insert(taskAcceptanceEvents)
      .values({ taskId, actorId, action: "update", note: "更新任务信息", createdAt: changed.updatedAt }).returning({ id: taskAcceptanceEvents.id });
    await enqueueCollaborationNotice(actorId, { target: { kind: "task", id: taskId }, event: "task_update", eventKey: `updated:${event.id}`, title: `任务已更新：${changed.title}`.slice(0, 200), link: `/p/${row.projectId}/tasks/${taskId}`, participantUserIds: changed.assigneeId ? [changed.assigneeId] : [] }, tx);
    return { changed, permissions: latestAccess.capabilities.task };
  });
  return withOrganization(toActorDTO(
    { ...updated.changed, assigneeName: row.assigneeName },
    updated.permissions,
  ), actorId);
}

export async function deleteTask(
  actorId: string,
  taskId: string,
): Promise<void> {
  const row = await loadTaskRow(taskId);
  const access = await assertRole(actorId, row.projectId, "delete");
  await db.transaction(async (tx) => {
    await lockTeamTaskAccess(tx, actorId, row.projectId, access.project.teamId, "delete");
    if (row.parentTaskId) await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, row.parentTaskId)).for("update");
    const [current] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!current) throw new NotFoundError("任务不存在");
    const children = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, taskId));
    const protectedIds = [taskId, ...children.map((child) => child.id)];
    const [entry, issue, history] = await Promise.all([
      tx.select({ id: deliveryEntries.id }).from(deliveryEntries).where(inArray(deliveryEntries.taskId, protectedIds)).limit(1),
      tx.select({ id: deliveryIssues.id }).from(deliveryIssues).where(inArray(deliveryIssues.taskId, protectedIds)).limit(1),
      tx.select({ id: deliveryRecords.id }).from(deliveryRecords).where(or(...protectedIds.map((id) => sql`${deliveryRecords.snapshot}->'entries' @> ${JSON.stringify([{ taskId: id }])}::jsonb`))).limit(1),
    ]);
    if (entry.length || issue.length || history.length) throw new ConflictError("任务或子任务已用于交付材料、评审问题或历史交付记录，不能删除；请保留任务并按需调整状态");
    await assertTaskDependencyDeletion(tx, taskId);
    await tx.insert(taskAcceptanceEvents).values({ taskId, actorId, action: "delete", createdAt: new Date() });
    await tx.delete(tasks).where(eq(tasks.id, taskId));
  });
}

export async function transitionTask(
  actorId: string,
  taskId: string,
  action: TransitionAction,
  input?: TransitionInput,
): Promise<TaskDTO> {
  const initial = await loadTaskRow(taskId);
  const access = await assertRole(actorId, initial.projectId, action);
  let note = input?.note?.trim() || null;
  const result = await db.transaction(async (tx) => {
    const latestAccess = await lockTeamTaskAccess(tx, actorId, initial.projectId, access.project.teamId, action);
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
        { ...row, permissions: latestAccess.capabilities.task },
        latestAccess.role,
        actorId,
      ).includes(rule)
    ) {
      throw new ForbiddenError("只能操作自己认领的任务");
    }

    const now = new Date();
    await assertTaskDependencyTransition(tx, taskId, action);
    if (action === "submit" || action === "resubmit") note = await writeSubmission(tx, actorId, row, input?.delivery, now);
    else if (action === "accept" || action === "reject") note = await writeReview(tx, actorId, row, action, input?.review, now);
    else if (note && note.length > 5000) throw new AppError("说明最多 5000 字");
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
            eq(teamMembers.teamId, latestAccess.project.teamId),
            eq(teamMembers.userId, target),
          ),
        );
      if (!member) throw new AppError("指派对象不在团队中");
      if (
        !capabilitiesFor(
          member.positions ?? positionsFromRole(member.role),
          latestAccess.project.kind,
        ).execute
      )
        throw new AppError("请选择有组员、队长、副管理员或管理员职务的成员作为负责人");
      nextAssignee = target;
    }

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
      .values({ taskId, actorId, action, note, createdAt: now });
    return toActorDTO(await loadTaskRow(taskId, tx), latestAccess.capabilities.task);
  });

  if (action === "claim" || action === "assign") {
    await fireNotify(() => notifyAssigned(taskId, actorId));
  } else if (action === "submit" || action === "resubmit") {
    await fireNotify(() => notifySubmitted(taskId, actorId));
  } else if (action === "accept") {
    await fireNotify(() => notifyAccepted(taskId, actorId));
  } else if (action === "reject") {
    await fireNotify(() => notifyRejected(taskId, note ?? "", actorId));
  }

  return withOrganization(result, actorId);
}

export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: {
    title: string;
    description?: string;
    dueDate?: string;
    priority?: TaskPriority;
    assigneeId?: string;
    acceptanceCriteria?: AcceptanceCriterion[];
    requestKey?: string;
    milestoneId?: string;
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
    assigneeId: input.assigneeId,
    acceptanceCriteria: input.acceptanceCriteria,
    requestKey: input.requestKey,
    milestoneId: input.milestoneId,
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

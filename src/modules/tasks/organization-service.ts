import { and, asc, count, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbTx } from "@/db";
import { projectTaskLabels, taskDependencies, taskLabelAssignments, taskOrganizationStates, tasks, users, taskAcceptanceEvents } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import type { TaskPermissions } from "@/modules/identity/client";
import { lockTeamTaskAccess } from "./task-locks";
import { enqueueCollaborationNotice } from "@/modules/notify";
import { taskLabelCreateSchema, taskLabelPatchSchema, taskOrganizationMutationSchema, wouldCreateTaskDependencyCycle, type TaskLabelDTO, type TaskOrganizationDTO, type TaskOrganizationMutation, type TaskOrganizationSummary, type TaskRelationTask } from "./organization-client";

type OrganizationTask = typeof tasks.$inferSelect;
function canEditTask(actorId: string, task: OrganizationTask, permissions: TaskPermissions) {
  return permissions.actions.includes("assign") || (permissions.actions.includes("submit") && task.assigneeId === actorId);
}
function canManageLabels(permissions: TaskPermissions) { return permissions.actions.includes("assign"); }
const emptySummary = (): TaskOrganizationSummary => ({ labels: [], blockedByIds: [], blockingIds: [], blocked: false, reopenBlocked: false });

async function taskAndAccess(actorId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  const access = await requireProjectForUser(actorId, task.projectId);
  return { task, access };
}

export async function loadTaskOrganizationSummaries(taskIds: string[], connection: DbTx = db): Promise<Map<string, TaskOrganizationSummary>> {
  const result = new Map(taskIds.map((id) => [id, emptySummary()]));
  if (!taskIds.length) return result;
  const blocker = alias(tasks, "organization_blocker");
  const blocked = alias(tasks, "organization_blocked");
  const labels = await connection.select({ taskId: taskLabelAssignments.taskId, label: projectTaskLabels }).from(taskLabelAssignments)
    .innerJoin(projectTaskLabels, eq(projectTaskLabels.id, taskLabelAssignments.labelId)).where(inArray(taskLabelAssignments.taskId, taskIds)).orderBy(asc(projectTaskLabels.name));
  const dependencies = await connection.select({ blockerId: taskDependencies.blockerTaskId, blockedId: taskDependencies.blockedTaskId, blockerStatus: blocker.status, blockedStatus: blocked.status }).from(taskDependencies)
    .innerJoin(blocker, eq(blocker.id, taskDependencies.blockerTaskId)).innerJoin(blocked, eq(blocked.id, taskDependencies.blockedTaskId))
    .where(or(inArray(taskDependencies.blockerTaskId, taskIds), inArray(taskDependencies.blockedTaskId, taskIds)));
  for (const item of labels) result.get(item.taskId)?.labels.push(item.label);
  for (const item of dependencies) {
    const incoming = result.get(item.blockedId);
    const outgoing = result.get(item.blockerId);
    if (incoming) { incoming.blockedByIds.push(item.blockerId); incoming.blocked ||= item.blockerStatus !== "accepted"; }
    if (outgoing) { outgoing.blockingIds.push(item.blockedId); outgoing.reopenBlocked ||= item.blockedStatus === "submitted" || item.blockedStatus === "accepted"; }
  }
  return result;
}

export async function listProjectTaskLabels(actorId: string, projectId: string): Promise<{ labels: TaskLabelDTO[]; canManage: boolean }> {
  const access = await requireProjectForUser(actorId, projectId);
  const labels = await db.select().from(projectTaskLabels).where(eq(projectTaskLabels.projectId, projectId)).orderBy(asc(projectTaskLabels.name));
  return { labels, canManage: canManageLabels(access.capabilities.task) };
}

export async function createProjectTaskLabel(actorId: string, projectId: string, input: { name: string; color?: TaskLabelDTO["color"] }): Promise<TaskLabelDTO> {
  const access = await requireProjectForUser(actorId, projectId);
  if (!canManageLabels(access.capabilities.task)) throw new ForbiddenError("只有有指派权限的成员可以管理项目标签");
  const parsed = taskLabelCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeamTaskAccess(tx, actorId, projectId, access.project.teamId, "assign");
    await assertLabelName(tx, projectId, parsed.data.name);
    const [{ total }] = await tx.select({ total: count() }).from(projectTaskLabels).where(eq(projectTaskLabels.projectId, projectId));
    if (total >= 200) throw new AppError("每个项目最多 200 个标签，请整理已有标签");
    const [label] = await tx.insert(projectTaskLabels).values({ projectId, ...parsed.data, createdById: actorId }).returning();
    return label;
  });
}

async function assertLabelName(tx: DbTx, projectId: string, name: string, exceptId?: string) {
  const [existing] = await tx.select({ id: projectTaskLabels.id }).from(projectTaskLabels).where(and(
    eq(projectTaskLabels.projectId, projectId), sql`lower(${projectTaskLabels.name}) = lower(${name})`, exceptId ? ne(projectTaskLabels.id, exceptId) : undefined,
  ));
  if (existing) throw new ConflictError("项目中已有同名标签，请选择已有标签或修改名称");
}

export async function updateProjectTaskLabel(actorId: string, projectId: string, labelId: string, input: { name: string; color?: TaskLabelDTO["color"]; version: number }): Promise<TaskLabelDTO> {
  const access = await requireProjectForUser(actorId, projectId);
  if (!canManageLabels(access.capabilities.task)) throw new ForbiddenError("只有有指派权限的成员可以管理项目标签");
  const parsed = taskLabelPatchSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeamTaskAccess(tx, actorId, projectId, access.project.teamId, "assign");
    const [current] = await tx.select().from(projectTaskLabels).where(and(eq(projectTaskLabels.id, labelId), eq(projectTaskLabels.projectId, projectId))).for("update");
    if (!current) throw new NotFoundError("当前项目中没有该标签");
    if (current.version !== parsed.data.version) throw new ConflictError("标签已变化，请重新加载后再保存");
    await assertLabelName(tx, projectId, parsed.data.name, labelId);
    const [label] = await tx.update(projectTaskLabels).set({ ...parsed.data, version: current.version + 1, updatedAt: new Date() }).where(eq(projectTaskLabels.id, labelId)).returning();
    return label;
  });
}

export async function deleteProjectTaskLabel(actorId: string, projectId: string, labelId: string, version: number): Promise<void> {
  const access = await requireProjectForUser(actorId, projectId);
  if (!canManageLabels(access.capabilities.task)) throw new ForbiddenError("只有有指派权限的成员可以管理项目标签");
  if (!Number.isInteger(version) || version < 1) throw new AppError("标签版本无效");
  await db.transaction(async (tx) => {
    await lockTeamTaskAccess(tx, actorId, projectId, access.project.teamId, "assign");
    const [label] = await tx.select().from(projectTaskLabels).where(and(eq(projectTaskLabels.id, labelId), eq(projectTaskLabels.projectId, projectId))).for("update");
    if (!label) throw new NotFoundError("当前项目中没有该标签");
    if (label.version !== version) throw new ConflictError("标签已变化，请重新加载后再删除");
    const assigned = await tx.select({ id: taskLabelAssignments.taskId }).from(taskLabelAssignments).where(eq(taskLabelAssignments.labelId, labelId));
    await tx.delete(projectTaskLabels).where(eq(projectTaskLabels.id, labelId));
    await bumpOrganizationVersions(tx, assigned.map((item) => item.id));
    for (const item of assigned) await tx.insert(taskAcceptanceEvents).values({ taskId: item.id, actorId, action: "update", note: `移除项目标签「${label.name}」` });
  });
}

async function bumpOrganizationVersions(tx: DbTx, taskIds: string[]) {
  const ids = [...new Set(taskIds)].sort();
  if (ids.length) await tx.insert(taskOrganizationStates).values(ids.map((taskId) => ({ taskId, version: 2 }))).onConflictDoUpdate({ target: taskOrganizationStates.taskId, set: { version: sql`${taskOrganizationStates.version} + 1`, updatedAt: new Date() } });
  if (taskIds.length) await tx.update(tasks).set({ updatedAt: new Date() }).where(inArray(tasks.id, taskIds));
}

export async function getTaskOrganization(actorId: string, taskId: string, query = ""): Promise<TaskOrganizationDTO> {
  const initial = await taskAndAccess(actorId, taskId);
  if (query.length > 100) throw new AppError("任务搜索最多 100 字");
  return db.transaction(async (tx) => {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.projectId !== initial.task.projectId) throw new NotFoundError("任务不存在");
  const permissions = initial.access.capabilities.task;
  const projectLabels = await tx.select().from(projectTaskLabels).where(eq(projectTaskLabels.projectId, task.projectId)).orderBy(asc(projectTaskLabels.name));
  const summary = (await loadTaskOrganizationSummaries([taskId], tx)).get(taskId)!;
  const [state] = await tx.select({ version: taskOrganizationStates.version }).from(taskOrganizationStates).where(eq(taskOrganizationStates.taskId, taskId));
  const edges = await tx.select().from(taskDependencies).where(and(eq(taskDependencies.projectId, task.projectId), or(eq(taskDependencies.blockerTaskId, taskId), eq(taskDependencies.blockedTaskId, taskId))));
  const relatedIds = [...new Set(edges.flatMap((edge) => [edge.blockerTaskId, edge.blockedTaskId]))];
  const related = relatedIds.length ? await tx.select({ task: tasks, assigneeName: users.name }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId)).where(inArray(tasks.id, relatedIds)) : [];
  const relatedMap = new Map(related.map((item) => [item.task.id, item]));
  function relationTask(id: string): TaskRelationTask {
    const item = relatedMap.get(id)!;
    return { id, title: item.task.title, status: item.task.status, assigneeName: item.assigneeName, canBlock: canEditTask(actorId, item.task, permissions) };
  }
  const canEdit = canEditTask(actorId, task, permissions);
  const search = query.trim().replace(/[\\%_]/g, "\\$&");
  const candidates = await tx.select({ task: tasks, assigneeName: users.name }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(eq(tasks.projectId, task.projectId), ne(tasks.id, taskId), search ? ilike(tasks.title, `%${search}%`) : undefined)).orderBy(asc(tasks.title), asc(tasks.id)).limit(51);
  return {
    taskId, projectId: task.projectId, version: state?.version ?? 1, canEdit, canManageLabels: canManageLabels(permissions),
    ...summary, projectLabels,
    blockedBy: edges.filter((edge) => edge.blockedTaskId === taskId).map((edge) => ({ id: edge.id, task: relationTask(edge.blockerTaskId), canRemove: canEdit })),
    blocking: edges.filter((edge) => edge.blockerTaskId === taskId).map((edge) => ({ id: edge.id, task: relationTask(edge.blockedTaskId), canRemove: canEdit && canEditTask(actorId, relatedMap.get(edge.blockedTaskId)!.task, permissions) })),
    candidates: candidates.slice(0, 50).map((item) => ({ id: item.task.id, title: item.task.title, status: item.task.status, assigneeName: item.assigneeName, canBlock: canEditTask(actorId, item.task, permissions) })),
    candidatesTruncated: candidates.length > 50, query,
  };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function changeTaskOrganization(actorId: string, taskId: string, input: TaskOrganizationMutation): Promise<TaskOrganizationDTO> {
  const { task, access } = await taskAndAccess(actorId, taskId);
  if (!canEditTask(actorId, task, access.capabilities.task)) throw new ForbiddenError("只有有指派权限的成员或当前执行负责人可以设置标签与依赖");
  const parsed = taskOrganizationMutationSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const change = parsed.data;
  await db.transaction(async (tx) => {
    const currentAccess = await lockTeamTaskAccess(tx, actorId, task.projectId, access.project.teamId, "update");
    let dependency: typeof taskDependencies.$inferSelect | undefined;
    if (change.op === "removeDependency") {
      [dependency] = await tx.select().from(taskDependencies).where(and(eq(taskDependencies.id, change.dependencyId), eq(taskDependencies.projectId, task.projectId), or(eq(taskDependencies.blockerTaskId, taskId), eq(taskDependencies.blockedTaskId, taskId))));
      if (!dependency) throw new ConflictError("该依赖已变化，请重新加载");
    }
    const taskIds = change.op === "addDependency" ? [taskId, change.otherTaskId] : dependency ? [dependency.blockerTaskId, dependency.blockedTaskId] : [taskId];
    const currentTasks = await tx.select().from(tasks).where(and(inArray(tasks.id, [...new Set(taskIds)].sort()), eq(tasks.projectId, task.projectId))).orderBy(asc(tasks.id)).for("update");
    const current = currentTasks.find((item) => item.id === taskId);
    if (!current) throw new NotFoundError("任务不存在");
    if (!canEditTask(actorId, current, currentAccess.capabilities.task)) throw new ForbiddenError("任务负责人或权限已变化，请重新加载");
    const [state] = await tx.select().from(taskOrganizationStates).where(eq(taskOrganizationStates.taskId, taskId));
    if ((state?.version ?? 1) !== change.version) throw new ConflictError("标签或依赖已变化，请重新加载后确认；你的选择已保留");
    if (change.op === "labels") {
      const labels = change.labelIds.length ? await tx.select().from(projectTaskLabels).where(and(eq(projectTaskLabels.projectId, task.projectId), inArray(projectTaskLabels.id, change.labelIds))) : [];
      if (labels.length !== change.labelIds.length) throw new AppError("请选择当前项目仍存在的标签");
      await tx.delete(taskLabelAssignments).where(eq(taskLabelAssignments.taskId, taskId));
      if (change.labelIds.length) await tx.insert(taskLabelAssignments).values(change.labelIds.map((labelId) => ({ taskId, labelId })));
      await bumpOrganizationVersions(tx, [taskId]);
      const note = labels.length ? `设置标签：${labels.map((label) => label.name).join("、")}` : "清空任务标签";
      const [event] = await tx.insert(taskAcceptanceEvents).values({ taskId, actorId, action: "update", note }).returning({ id: taskAcceptanceEvents.id });
      await enqueueCollaborationNotice(actorId, { target: { kind: "task", id: taskId }, event: "task_update", eventKey: `organization:${event.id}`, title: `${current.title}的标签已更新`.slice(0, 200), body: note, link: `/p/${task.projectId}/tasks/${taskId}`, participantUserIds: current.assigneeId ? [current.assigneeId] : [] }, tx);
      return;
    }
    const blockerId = dependency?.blockerTaskId ?? (change.op === "addDependency" && change.direction === "blockedBy" ? change.otherTaskId : taskId);
    const blockedId = dependency?.blockedTaskId ?? (change.op === "addDependency" && change.direction === "blocking" ? change.otherTaskId : taskId);
    const blockerTask = currentTasks.find((item) => item.id === blockerId);
    const blockedTask = currentTasks.find((item) => item.id === blockedId);
    if (!blockerTask || !blockedTask) throw new AppError("依赖任务必须属于当前项目");
    if (!canEditTask(actorId, blockedTask, currentAccess.capabilities.task)) throw new ForbiddenError("只有有指派权限的成员或被阻塞任务的负责人可以调整该依赖");
    if (change.op === "addDependency") {
      const edges = await tx.select().from(taskDependencies).where(eq(taskDependencies.projectId, task.projectId));
      if (wouldCreateTaskDependencyCycle(edges, blockerId, blockedId)) throw new ConflictError("该依赖会形成循环，请选择其他任务");
      if (edges.some((edge) => edge.blockerTaskId === blockerId && edge.blockedTaskId === blockedId)) throw new ConflictError("这两个任务已有该依赖，请重新加载");
      if (["submitted", "accepted"].includes(blockedTask.status) && blockerTask.status !== "accepted") throw new ConflictError("待验收或已完成任务不能新增未完成依赖，请先打回或重新打开被阻塞任务");
      if (edges.filter((edge) => edge.blockedTaskId === blockedId).length >= 50) throw new AppError("单个任务最多依赖 50 个任务，请整理依赖关系");
      await tx.insert(taskDependencies).values({ projectId: task.projectId, blockerTaskId: blockerId, blockedTaskId: blockedId, createdById: actorId });
    } else await tx.delete(taskDependencies).where(eq(taskDependencies.id, dependency!.id));
    await bumpOrganizationVersions(tx, [blockerId, blockedId]);
    const events = await tx.insert(taskAcceptanceEvents).values([
      { taskId: blockedId, actorId, action: "update", note: `${change.op === "addDependency" ? "新增" : "解除"}前置依赖：${blockerTask.title}` },
      { taskId: blockerId, actorId, action: "update", note: `${change.op === "addDependency" ? "新增" : "解除"}后续依赖：${blockedTask.title}` },
    ]).returning({ id: taskAcceptanceEvents.id, taskId: taskAcceptanceEvents.taskId, note: taskAcceptanceEvents.note });
    for (const event of events) {
      const affected = event.taskId === blockerId ? blockerTask : blockedTask;
      await enqueueCollaborationNotice(actorId, { target: { kind: "task", id: event.taskId }, event: "task_update", eventKey: `organization:${event.id}`, title: `${affected.title}的依赖已更新`.slice(0, 200), body: event.note ?? "任务依赖已更新", link: `/p/${task.projectId}/tasks/${event.taskId}`, participantUserIds: affected.assigneeId ? [affected.assigneeId] : [] }, tx);
    }
  });
  return getTaskOrganization(actorId, taskId);
}

export async function assertTaskDependencyTransition(tx: DbTx, taskId: string, action: string) {
  if (["submit", "resubmit", "accept"].includes(action)) {
    const blockers = await tx.select({ title: tasks.title }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.blockerTaskId))
      .where(and(eq(taskDependencies.blockedTaskId, taskId), ne(tasks.status, "accepted")));
    if (blockers.length) throw new ConflictError(`前置任务尚未验收：${blockers.slice(0, 3).map((item) => item.title).join("、")}${blockers.length > 3 ? "等" : ""}。请先完成验收或确认后解除依赖`);
  }
  if (action === "reopen") {
    const dependents = await tx.select({ title: tasks.title }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.blockedTaskId))
      .where(and(eq(taskDependencies.blockerTaskId, taskId), inArray(tasks.status, ["submitted", "accepted"])));
    if (dependents.length) throw new ConflictError(`已有后续任务待验收或已完成：${dependents.slice(0, 3).map((item) => item.title).join("、")}。请先解除这些依赖，或打回/重新打开后续任务`);
  }
}

export async function assertTaskDependencyDeletion(tx: DbTx, taskId: string) {
  const descendants = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, taskId));
  const ids = [taskId, ...descendants.map((item) => item.id)];
  const [dependency] = await tx.select({ id: taskDependencies.id }).from(taskDependencies).where(or(inArray(taskDependencies.blockerTaskId, ids), inArray(taskDependencies.blockedTaskId, ids))).limit(1);
  if (dependency) throw new ConflictError("该任务或子任务仍有依赖关系，请先解除依赖再删除");
}

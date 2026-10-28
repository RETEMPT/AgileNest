import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { deliveryBatches, deliveryEntries, deliveryIssues, deliveryRecords, memberPositions, projects, tasks, teamMembers, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, isValidISODate, requireProjectForUser } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { getApprovedTaskSubmission, listApprovedTaskSubmissions, type ApprovedTaskSubmission } from "@/modules/tasks";
import { enqueueCollaborationNotice } from "@/modules/notify";
import { deliveryBatchCreateSchema, deliveryCompletionError, deliveryMarkdown, deliveryMutationSchema, type DeliveryBatchDTO, type DeliveryBatchInput, type DeliveryMutation, type DeliveryProjectDTO, type DeliverySnapshot, type DeliveryRecordAction } from "./client";

type Batch = typeof deliveryBatches.$inferSelect;

async function lockAccess(tx: DbTx, actorId: string, projectId: string, teamId: string) {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.teamId, teamId)));
  const [member] = await tx.select({ role: teamMembers.role, positions: memberPositions.positions }).from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)));
  if (!project || !member) throw new ForbiddenError("当前账号已不具备项目协作权限");
  const capabilities = capabilitiesFor(member.positions ?? positionsFromRole(member.role), project.kind);
  return { organize: capabilities.manageProject || capabilities.review, confirm: capabilities.review };
}

async function membersFor(tx: DbTx, teamId: string) {
  return tx.select({ id: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, teamId));
}

async function assertOwner(tx: DbTx, teamId: string, ownerId: string | null) {
  if (!ownerId) return;
  const [member] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, ownerId)));
  if (!member) throw new AppError("请选择当前团队中的责任人");
}

async function readBatch(tx: DbTx, batch: Batch, actorId: string, permissions: { organize: boolean; confirm: boolean }, memberNames: Map<string, string | null>): Promise<DeliveryBatchDTO> {
  const [entries, issues, records, completedBy] = await Promise.all([
    tx.select({ entry: deliveryEntries, currentTaskStatus: tasks.status, currentTaskTitle: tasks.title }).from(deliveryEntries).innerJoin(tasks, eq(tasks.id, deliveryEntries.taskId)).where(eq(deliveryEntries.batchId, batch.id)).orderBy(asc(deliveryEntries.createdAt)),
    tx.select().from(deliveryIssues).where(eq(deliveryIssues.batchId, batch.id)).orderBy(asc(deliveryIssues.createdAt)),
    tx.select().from(deliveryRecords).where(eq(deliveryRecords.batchId, batch.id)).orderBy(desc(deliveryRecords.version)).limit(40),
    batch.completedById ? tx.select({ name: users.name }).from(users).where(eq(users.id, batch.completedById)) : Promise.resolve([]),
  ]);
  return {
    id: batch.id, projectId: batch.projectId, name: batch.name, description: batch.description, ownerId: batch.ownerId, ownerName: batch.ownerId ? memberNames.get(batch.ownerId) ?? null : null, dueDate: batch.dueDate,
    checklist: batch.checklist, status: batch.status, archived: batch.archived, version: batch.version, completedByName: completedBy[0]?.name ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null, createdAt: batch.createdAt.toISOString(), updatedAt: batch.updatedAt.toISOString(),
    entries: entries.map(({ entry, currentTaskStatus, currentTaskTitle }) => ({ ...entry.snapshot, id: entry.id, currentTaskStatus, currentTaskTitle, createdAt: entry.createdAt.toISOString() })),
    issues: issues.map((issue) => ({ id: issue.id, taskId: issue.taskId, title: issue.title, detail: issue.detail, ownerId: issue.ownerId, ownerName: issue.ownerId ? memberNames.get(issue.ownerId) ?? null : null, resolved: issue.resolved, resolution: issue.resolution, version: issue.version, canResolve: !batch.archived && batch.status === "draft" && (permissions.organize || issue.ownerId === actorId), updatedAt: issue.updatedAt.toISOString() })),
    records: records.map((record) => ({ id: record.id, action: record.action, version: record.version, actorName: record.nameSnapshot, createdAt: record.createdAt.toISOString(), snapshot: record.snapshot })),
    canOrganize: permissions.organize, canConfirm: permissions.confirm,
  };
}

function snapshotOf(batch: DeliveryBatchDTO): DeliverySnapshot {
  return { name: batch.name, description: batch.description, ownerId: batch.ownerId, ownerName: batch.ownerName, dueDate: batch.dueDate, checklist: batch.checklist, status: batch.status, archived: batch.archived,
    entries: batch.entries.map(({ taskId, taskTitle, submission }) => ({ taskId, taskTitle, submission })),
    issues: batch.issues.map(({ id, taskId, title, detail, ownerId, ownerName, resolved, resolution }) => ({ id, taskId, title, detail, ownerId, ownerName, resolved, resolution })),
  };
}

export async function getProjectDeliveries(actorId: string, projectId: string): Promise<DeliveryProjectDTO> {
  const access = await requireProjectForUser(actorId, projectId);
  const candidates = await listApprovedTaskSubmissions(actorId, projectId);
  return db.transaction(async (tx) => {
    const members = await membersFor(tx, access.project.teamId);
    const names = new Map(members.map((member) => [member.id, member.name]));
    const permissions = { organize: access.capabilities.manageProject || access.capabilities.review, confirm: access.capabilities.review };
    const rows = await tx.select().from(deliveryBatches).where(eq(deliveryBatches.projectId, projectId)).orderBy(desc(deliveryBatches.updatedAt));
    const batches: DeliveryBatchDTO[] = [];
    for (const row of rows) batches.push(await readBatch(tx, row, actorId, permissions, names));
    return { projectId, projectName: access.project.name, canOrganize: permissions.organize, members, candidates, batches };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function getDeliveryBatch(actorId: string, batchId: string): Promise<DeliveryBatchDTO> {
  const [initial] = await db.select().from(deliveryBatches).where(eq(deliveryBatches.id, batchId));
  if (!initial) throw new NotFoundError("交付批次不存在");
  const access = await requireProjectForUser(actorId, initial.projectId);
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(deliveryBatches).where(eq(deliveryBatches.id, batchId));
    if (!batch) throw new NotFoundError("交付批次不存在");
    const members = await membersFor(tx, batch.teamId);
    return readBatch(tx, batch, actorId, { organize: access.capabilities.manageProject || access.capabilities.review, confirm: access.capabilities.review }, new Map(members.map((member) => [member.id, member.name])));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function writeRecord(tx: DbTx, batch: Batch, actorId: string, action: DeliveryRecordAction, permissions: { organize: boolean; confirm: boolean }) {
  const [actor] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
  const members = await membersFor(tx, batch.teamId);
  const dto = await readBatch(tx, batch, actorId, permissions, new Map(members.map((member) => [member.id, member.name])));
  await tx.insert(deliveryRecords).values({ batchId: batch.id, action, version: batch.version, actorId, nameSnapshot: actor?.name ?? null, snapshot: snapshotOf(dto), createdAt: batch.updatedAt });
  await enqueueCollaborationNotice(actorId, { target: { kind: "project", id: batch.projectId }, event: "task_update", eventKey: `delivery:${batch.id}:${batch.version}`, title: `交付更新：${batch.name}`.slice(0, 200), body: action === "complete" ? "阶段成果已核对并确认，查看通过版本与交付记录。" : "交付清单或评审问题有更新，请查看当前记录。", link: `/p/${batch.projectId}/delivery?batch=${batch.id}`, participantUserIds: [...new Set([batch.ownerId, ...dto.issues.filter((issue) => !issue.resolved).map((issue) => issue.ownerId)].filter((id): id is string => Boolean(id)))] }, tx);
  return dto;
}

export async function createDeliveryBatch(actorId: string, projectId: string, input: DeliveryBatchInput, requestKey?: string) {
  const access = await requireProjectForUser(actorId, projectId);
  const parsed = deliveryBatchCreateSchema.safeParse({ ...input, ...(requestKey !== undefined ? { requestKey } : {}) });
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  if (parsed.data.dueDate && !isValidISODate(parsed.data.dueDate)) throw new AppError("截止日期无效");
  const { requestKey: key, ...content } = parsed.data;
  return db.transaction(async (tx) => {
    const permissions = await lockAccess(tx, actorId, projectId, access.project.teamId);
    if (!permissions.organize) throw new ForbiddenError("只有项目管理或验收职务可以整理阶段交付");
    if (key) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const [existing] = await tx.select().from(deliveryBatches).where(eq(deliveryBatches.id, key));
      if (existing) {
        if (existing.projectId !== projectId || existing.createdById !== actorId) throw new ConflictError("此新建请求已被使用，请重新开始建立交付");
        return existing.id;
      }
    }
    await assertOwner(tx, access.project.teamId, content.ownerId);
    const now = new Date();
    const [batch] = await tx.insert(deliveryBatches).values({ ...(key ? { id: key } : {}), teamId: access.project.teamId, projectId, ...content, createdById: actorId, createdAt: now, updatedAt: now }).returning();
    await writeRecord(tx, batch, actorId, "create", permissions);
    return batch.id;
  });
}

export async function mutateDeliveryBatch(actorId: string, batchId: string, input: DeliveryMutation) {
  const [initial] = await db.select().from(deliveryBatches).where(eq(deliveryBatches.id, batchId));
  if (!initial) throw new NotFoundError("交付批次不存在");
  await requireProjectForUser(actorId, initial.projectId);
  const parsed = deliveryMutationSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const change = parsed.data;
  await db.transaction(async (tx) => {
    const permissions = await lockAccess(tx, actorId, initial.projectId, initial.teamId);
    const [batch] = await tx.select().from(deliveryBatches).where(eq(deliveryBatches.id, batchId)).for("update");
    if (!batch) throw new NotFoundError("交付批次不存在");
    if (batch.version !== change.version) throw new ConflictError("交付批次已被更新，请保留草稿并重新加载核对");
    if (batch.archived && change.op !== "restore") throw new ConflictError("交付已归档，请先恢复后操作");
    if (batch.status === "completed" && !["reopen", "archive", "restore"].includes(change.op)) throw new ConflictError("已确认交付记录不能覆盖，请显式重新开启后修改");
    const issueAction = change.op === "resolve" || change.op === "reopenIssue";
    if (!permissions.organize && !issueAction) throw new ForbiddenError("当前职务不能整理阶段交付");
    if (["complete", "reopen"].includes(change.op) && !permissions.confirm) throw new ForbiddenError("只有管理员、副管理员或指导老师可以确认或重开阶段交付");
    const now = new Date();
    let patch: Partial<typeof deliveryBatches.$inferInsert> = {};
    if (change.op === "edit") {
      if (change.data.dueDate && !isValidISODate(change.data.dueDate)) throw new AppError("截止日期无效");
      await assertOwner(tx, batch.teamId, change.data.ownerId);
      patch = change.data;
    } else if (change.op === "bind") {
      const snapshot: ApprovedTaskSubmission = await getApprovedTaskSubmission(actorId, batch.projectId, change.taskId, change.submissionId, tx);
      const [existing] = await tx.select({ id: deliveryEntries.id }).from(deliveryEntries).where(and(eq(deliveryEntries.batchId, batch.id), eq(deliveryEntries.taskId, change.taskId)));
      if (existing) throw new ConflictError("该任务已在交付清单中，请先移除旧关联后选择新的通过版本");
      await tx.insert(deliveryEntries).values({ batchId, taskId: change.taskId, submissionId: change.submissionId, snapshot, createdById: actorId, createdAt: now });
    } else if (change.op === "unbind") {
      const [entry] = await tx.select({ id: deliveryEntries.id }).from(deliveryEntries).where(and(eq(deliveryEntries.id, change.entryId), eq(deliveryEntries.batchId, batchId)));
      if (!entry) throw new NotFoundError("交付关联不存在");
      await tx.delete(deliveryEntries).where(eq(deliveryEntries.id, entry.id));
    } else if (change.op === "issue") {
      await assertOwner(tx, batch.teamId, change.ownerId);
      if (change.taskId) {
        const [task] = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, change.taskId), eq(tasks.projectId, batch.projectId))).for("update");
        if (!task) throw new AppError("评审问题只能关联当前项目任务");
      }
      await tx.insert(deliveryIssues).values({ batchId, taskId: change.taskId, title: change.title, detail: change.detail, ownerId: change.ownerId, createdById: actorId, createdAt: now, updatedAt: now });
    } else if (change.op === "resolve" || change.op === "reopenIssue") {
      const [issue] = await tx.select().from(deliveryIssues).where(and(eq(deliveryIssues.id, change.issueId), eq(deliveryIssues.batchId, batchId))).for("update");
      if (!issue) throw new NotFoundError("评审问题不存在");
      if (!permissions.organize && issue.ownerId !== actorId) throw new ForbiddenError("只有该问题责任人或项目管理职务可以记录处理结果");
      if (issue.version !== change.issueVersion) throw new ConflictError("评审问题已被更新，请重新加载");
      if ((change.op === "resolve") === issue.resolved) throw new ConflictError("问题处理状态已变化，请重新加载");
      await tx.update(deliveryIssues).set({ resolved: change.op === "resolve", resolution: change.op === "resolve" ? change.resolution : null, version: issue.version + 1, updatedAt: now }).where(eq(deliveryIssues.id, issue.id));
    } else if (change.op === "complete") {
      if (batch.status !== "draft") throw new ConflictError("当前交付已确认");
      await assertOwner(tx, batch.teamId, batch.ownerId);
      const entries = await tx.select().from(deliveryEntries).where(eq(deliveryEntries.batchId, batchId)).orderBy(asc(deliveryEntries.taskId));
      for (const entry of entries) await getApprovedTaskSubmission(actorId, batch.projectId, entry.taskId, entry.submissionId, tx);
      const members = await membersFor(tx, batch.teamId);
      const dto = await readBatch(tx, batch, actorId, permissions, new Map(members.map((member) => [member.id, member.name])));
      const error = deliveryCompletionError(dto);
      if (error) throw new ConflictError(error);
      patch = { status: "completed", completedById: actorId, completedAt: now };
    } else if (change.op === "reopen") {
      if (batch.status !== "completed") throw new ConflictError("只有已确认交付可以重新开启");
      patch = { status: "draft", completedById: null, completedAt: null, checklist: batch.checklist.map((item) => ({ ...item, checked: false })) };
    } else if (change.op === "archive") {
      if (batch.archived) throw new ConflictError("交付已归档");
      patch = { archived: true };
    } else if (change.op === "restore") {
      if (!batch.archived) throw new ConflictError("交付未归档");
      patch = { archived: false };
    }
    const [changed] = await tx.update(deliveryBatches).set({ ...patch, version: batch.version + 1, updatedAt: now }).where(eq(deliveryBatches.id, batchId)).returning();
    await writeRecord(tx, changed, actorId, change.op, permissions);
  });
  return getDeliveryBatch(actorId, batchId);
}

export async function exportDeliveryRecord(actorId: string, batchId: string, version: number, format: "markdown" | "json") {
  const [batch] = await db.select({ projectId: deliveryBatches.projectId }).from(deliveryBatches).where(eq(deliveryBatches.id, batchId));
  if (!batch) throw new NotFoundError("交付批次不存在");
  await requireProjectForUser(actorId, batch.projectId);
  const [record] = await db.select().from(deliveryRecords).where(and(eq(deliveryRecords.batchId, batchId), eq(deliveryRecords.version, version)));
  if (!record) throw new NotFoundError("交付记录版本不存在");
  return { fileName: `delivery-v${version}.${format === "json" ? "json" : "md"}`, body: format === "json" ? JSON.stringify({ version, action: record.action, createdAt: record.createdAt.toISOString(), snapshot: record.snapshot }, null, 2) : deliveryMarkdown(record.snapshot, version) };
}

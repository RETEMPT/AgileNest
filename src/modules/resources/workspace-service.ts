import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { capabilitiesFor } from "@/modules/identity/client";
import { db, type DbTx } from "@/db";
import { projects, resourceCollaboration, resourceCollaborators, resourceCommentMentions, resourceCommentRevisions, resourceComments, resourceFolderCategories, resourceFolders, resourceLinks, resourcePlacements, taskActionItemOrigins, tasks, teamMembers, teamResources, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { getTaskDetail, listProjectTasks } from "@/modules/tasks";
import { enqueueCollaborationNotice } from "@/modules/notify";
import { accessScope, getResource, listResources, lockManaged, requireActiveResource } from "./service";
import { collaborationSchema, commentInputSchema, commentPatchSchema, folderDeleteSchema, folderInputSchema, folderPatchSchema, placementSchema, resourceLinkSchema } from "./schema";
import { validateFolderMove, type ResourceCategory, type ResourceCollaborationDTO, type ResourceCommentDTO, type ResourceDTO, type ResourceFolderDTO, type ResourceLinkDTO } from "./client";

type Scope = { teamId?: string; projectId?: string };
function parsed<T extends z.ZodType>(schema: T, input: unknown): z.output<T> { const result = schema.safeParse(input); if (!result.success) throw new AppError(result.error.issues[0].message); return result.data; }
function sameScope(left: { teamId: string; projectId: string | null }, right: { teamId: string; projectId: string | null }) { return left.teamId === right.teamId && left.projectId === right.projectId; }
function resourceHref(row: { id: string; teamId: string; projectId: string | null }) { return row.projectId ? `/p/${row.projectId}/resources?resource=${row.id}` : `/t/${row.teamId}/resources?resource=${row.id}`; }
async function lockScope(actorId: string, scope: Scope, tx: DbTx, teamId: string) {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  return accessScope(actorId, scope, tx);
}
function folderDTO(row: typeof resourceFolders.$inferSelect, actorId: string, admin: boolean, category: ResourceCategory = "general"): ResourceFolderDTO { return { id: row.id, teamId: row.teamId, projectId: row.projectId, parentId: row.parentId, name: row.name, category, version: row.version, canManage: admin || row.createdById === actorId }; }
async function folderRows(teamId: string, tx: DbTx) {
  return (await tx.select({ folder: resourceFolders, category: resourceFolderCategories.category }).from(resourceFolders).leftJoin(resourceFolderCategories, eq(resourceFolderCategories.folderId, resourceFolders.id)).where(eq(resourceFolders.teamId, teamId))).map(({ folder, category }) => ({ ...folder, category: (category ?? "general") as ResourceCategory }));
}

export async function listResourceFolders(actorId: string, scope: Scope): Promise<ResourceFolderDTO[]> {
  const access = await accessScope(actorId, scope);
  const rows = await db.select({ folder: resourceFolders, category: resourceFolderCategories.category, projectName: projects.name }).from(resourceFolders).leftJoin(resourceFolderCategories, eq(resourceFolderCategories.folderId, resourceFolders.id)).leftJoin(projects, eq(projects.id, resourceFolders.projectId)).where(and(eq(resourceFolders.teamId, access.teamId), access.projectId ? or(eq(resourceFolders.projectId, access.projectId), isNull(resourceFolders.projectId)) : undefined)).orderBy(asc(resourceFolders.name), asc(resourceFolders.id));
  return rows.map((row) => ({ ...folderDTO(row.folder, actorId, capabilitiesFor(access.member.positions).manageResources, (row.category ?? "general") as ResourceCategory), legacy: row.category === null, projectName: row.projectName }));
}
export async function createResourceFolder(actorId: string, input: z.input<typeof folderInputSchema>) {
  const v = parsed(folderInputSchema, input); const access = await accessScope(actorId, v);
  return db.transaction(async (tx) => {
    const current = await lockScope(actorId, v, tx, access.teamId);
    const rows = await folderRows(access.teamId, tx);
    if (rows.length >= 500) throw new ConflictError("团队主题目录已达到 500 个，请整理现有目录");
    const category = v.category ?? rows.find((row) => row.id === v.parentId)?.category ?? "general";
    const candidate: ResourceFolderDTO = { id: crypto.randomUUID(), teamId: access.teamId, projectId: access.projectId, parentId: null, name: v.name, category, version: 1, canManage: true };
    const issue = validateFolderMove(rows.map((row) => folderDTO(row, actorId, capabilitiesFor(current.member.positions).manageResources, row.category)), candidate, v.parentId);
    if (issue) throw new ConflictError(issue);
    if (rows.some((row) => sameScope(row, candidate) && row.category === category && row.parentId === v.parentId && row.name.toLocaleLowerCase() === v.name.toLocaleLowerCase())) throw new ConflictError("该主题下已有同名文件夹");
    const [created] = await tx.insert(resourceFolders).values({ teamId: access.teamId, projectId: access.projectId, parentId: v.parentId, name: v.name, createdById: actorId }).returning();
    await tx.insert(resourceFolderCategories).values({ folderId: created.id, category });
    return folderDTO(created, actorId, capabilitiesFor(current.member.positions).manageResources, category);
  });
}
export async function updateResourceFolder(actorId: string, input: z.input<typeof folderPatchSchema>) {
  const v = parsed(folderPatchSchema, input); const [initial] = await db.select().from(resourceFolders).where(eq(resourceFolders.id, v.folderId));
  if (!initial) throw new NotFoundError("目录不存在");
  const scope = { teamId: initial.teamId, projectId: initial.projectId ?? undefined }; await accessScope(actorId, scope);
  return db.transaction(async (tx) => {
    const access = await lockScope(actorId, scope, tx, initial.teamId);
    const rows = await folderRows(initial.teamId, tx);
    const row = rows.find((folder) => folder.id === v.folderId); if (!row) throw new NotFoundError("目录不存在");
    if (row.createdById !== actorId && !capabilitiesFor(access.member.positions).manageResources) throw new ForbiddenError("仅目录创建者、管理员或副管理员可维护目录");
    if (row.version !== v.version) throw new ConflictError("目录已更新，请保留输入并加载最新目录");
    const issue = validateFolderMove(rows.map((folder) => folderDTO(folder, actorId, capabilitiesFor(access.member.positions).manageResources, folder.category)), folderDTO(row, actorId, true, row.category), v.parentId);
    if (issue) throw new ConflictError(issue);
    if (rows.some((folder) => folder.id !== row.id && sameScope(folder, row) && folder.category === row.category && folder.parentId === v.parentId && folder.name.toLocaleLowerCase() === v.name.toLocaleLowerCase())) throw new ConflictError("该主题下已有同名文件夹");
    const [updated] = await tx.update(resourceFolders).set({ name: v.name, parentId: v.parentId, version: row.version + 1, updatedAt: new Date() }).where(eq(resourceFolders.id, row.id)).returning();
    return folderDTO(updated, actorId, capabilitiesFor(access.member.positions).manageResources, row.category);
  });
}
export async function deleteResourceFolder(actorId: string, input: z.input<typeof folderDeleteSchema>) {
  const v = parsed(folderDeleteSchema, input); const [initial] = await db.select().from(resourceFolders).where(eq(resourceFolders.id, v.folderId));
  if (!initial) throw new NotFoundError("目录不存在"); const scope = { teamId: initial.teamId, projectId: initial.projectId ?? undefined }; await accessScope(actorId, scope);
  await db.transaction(async (tx) => {
    const access = await lockScope(actorId, scope, tx, initial.teamId);
    const [row] = await tx.select().from(resourceFolders).where(eq(resourceFolders.id, initial.id)).for("update"); if (!row) throw new NotFoundError("目录不存在");
    if (row.createdById !== actorId && !capabilitiesFor(access.member.positions).manageResources) throw new ForbiddenError("仅目录创建者或资料管理员可删除目录");
    if (row.version !== v.version) throw new ConflictError("目录已更新，请刷新后核对再删除");
    const [child] = await tx.select({ id: resourceFolders.id }).from(resourceFolders).where(eq(resourceFolders.parentId, row.id)).limit(1);
    const [placement] = await tx.select({ id: resourcePlacements.resourceId }).from(resourcePlacements).where(eq(resourcePlacements.folderId, row.id)).limit(1);
    if (child || placement) throw new ConflictError("请先移走子目录和资料（含回收站中的资料），仅空目录可以删除");
    await tx.delete(resourceFolders).where(eq(resourceFolders.id, row.id));
  });
}
export async function placeResource(actorId: string, input: z.input<typeof placementSchema>): Promise<ResourceDTO> {
  const v = parsed(placementSchema, input); const resource = await getResource(actorId, v.resourceId);
  await db.transaction(async (tx) => {
    const row = await lockManaged(actorId, v.resourceId, tx, resource);
    const [placement] = await tx.select().from(resourcePlacements).where(eq(resourcePlacements.resourceId, row.id));
    if ((placement?.version ?? 1) !== v.version) throw new ConflictError("资料位置或置顶状态已变化，请刷新后重试");
    if (v.folderId) {
      const [folder] = await tx.select({ folder: resourceFolders, category: resourceFolderCategories.category }).from(resourceFolders).leftJoin(resourceFolderCategories, eq(resourceFolderCategories.folderId, resourceFolders.id)).where(eq(resourceFolders.id, v.folderId));
      if (!folder || !sameScope(folder.folder, row)) throw new ForbiddenError("资料只能放入相同团队及项目范围的目录");
      if (v.folderId !== placement?.folderId && (folder.category ?? "general") !== row.category) throw new ConflictError("请选择资料所属分类内的主题文件夹");
    }
    await tx.insert(resourcePlacements).values({ resourceId: row.id, folderId: v.folderId, pinned: v.pinned, version: v.version + 1 }).onConflictDoUpdate({ target: resourcePlacements.resourceId, set: { folderId: v.folderId, pinned: v.pinned, version: v.version + 1, updatedAt: new Date() } });
  });
  return getResource(actorId, v.resourceId);
}

export async function getResourceCollaboration(actorId: string, resourceId: string): Promise<ResourceCollaborationDTO> {
  const resource = await getResource(actorId, resourceId);
  const [settings] = await db.select().from(resourceCollaboration).where(eq(resourceCollaboration.resourceId, resourceId));
  const members = await db.select({ id: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, resource.teamId)).orderBy(asc(users.name));
  const grants = await db.select({ userId: resourceCollaborators.userId, name: users.name, permission: resourceCollaborators.permission }).from(resourceCollaborators).innerJoin(users, eq(users.id, resourceCollaborators.userId)).innerJoin(teamMembers, and(eq(teamMembers.userId, resourceCollaborators.userId), eq(teamMembers.teamId, resource.teamId))).where(eq(resourceCollaborators.resourceId, resourceId)).orderBy(asc(users.name));
  return { version: settings?.version ?? 1, commentScope: settings?.commentScope ?? "team", collaborators: grants, members };
}
export async function setResourceCollaboration(actorId: string, input: z.input<typeof collaborationSchema>) {
  const v = parsed(collaborationSchema, input); const resource = await getResource(actorId, v.resourceId);
  if (new Set(v.collaborators.map((row) => row.userId)).size !== v.collaborators.length) throw new AppError("协作者不能重复");
  await db.transaction(async (tx) => {
    await lockManaged(actorId, resource.id, tx, resource);
    const [settings] = await tx.select().from(resourceCollaboration).where(eq(resourceCollaboration.resourceId, resource.id));
    if ((settings?.version ?? 1) !== v.version) throw new ConflictError("协作权限已变化，请保留设置并获取最新版本");
    const memberIds = new Set((await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, resource.teamId))).map((row) => row.userId));
    if (v.collaborators.some((row) => !memberIds.has(row.userId))) throw new ForbiddenError("协作者必须是当前团队成员");
    await tx.insert(resourceCollaboration).values({ resourceId: resource.id, commentScope: v.commentScope, version: v.version + 1 }).onConflictDoUpdate({ target: resourceCollaboration.resourceId, set: { commentScope: v.commentScope, version: v.version + 1, updatedAt: new Date() } });
    await tx.delete(resourceCollaborators).where(eq(resourceCollaborators.resourceId, resource.id));
    if (v.collaborators.length) await tx.insert(resourceCollaborators).values(v.collaborators.map((row) => ({ resourceId: resource.id, userId: row.userId, permission: row.permission, grantedById: actorId })));
  });
  return getResourceCollaboration(actorId, resource.id);
}

async function lockResourceRead(actorId: string, resource: ResourceDTO, tx: DbTx) {
  const access = await lockScope(actorId, { teamId: resource.teamId, projectId: resource.projectId ?? undefined }, tx, resource.teamId);
  const [row] = await tx.select().from(teamResources).where(eq(teamResources.id, resource.id)).for("update");
  if (!row) throw new NotFoundError("资料不存在");
  await requireActiveResource(row.id, tx);
  const manage = row.createdById === actorId || capabilitiesFor(access.member.positions).manageResources;
  const [grant] = await tx.select().from(resourceCollaborators).where(and(eq(resourceCollaborators.resourceId, row.id), eq(resourceCollaborators.userId, actorId)));
  const [settings] = await tx.select().from(resourceCollaboration).where(eq(resourceCollaboration.resourceId, row.id));
  return { row, manage, comment: manage || !!grant || settings?.commentScope !== "collaborators", edit: manage || row.kind !== "file" && grant?.permission === "edit" };
}
export async function linkResource(actorId: string, input: z.input<typeof resourceLinkSchema>) {
  const v = parsed(resourceLinkSchema, input); const source = await getResource(actorId, v.sourceResourceId);
  const target = v.targetResourceId ? await getResource(actorId, v.targetResourceId) : null;
  const task = v.targetTaskId ? await getTaskDetail(actorId, v.targetTaskId) : null;
  if (target && (target.id === source.id || target.teamId !== source.teamId || (target.projectId && source.projectId && target.projectId !== source.projectId))) throw new ForbiddenError("只能关联相同项目或团队共享的其他资料");
  if (task && source.projectId && task.projectId !== source.projectId) throw new ForbiddenError("只能关联当前项目任务");
  if (task) { const access = await accessScope(actorId, { projectId: task.projectId }); if (access.teamId !== source.teamId) throw new ForbiddenError("任务与资料必须属于同一团队"); }
  return db.transaction(async (tx) => {
    await lockScope(actorId, { teamId: source.teamId, projectId: source.projectId ?? undefined }, tx, source.teamId);
    if (task) { const [currentTask] = await tx.select().from(tasks).where(and(eq(tasks.id, task.id), eq(tasks.projectId, task.projectId))).for("update"); if (!currentTask) throw new NotFoundError("任务不存在"); }
    const ids = [source.id, ...(target ? [target.id] : [])].sort();
    const rows = await tx.select().from(teamResources).where(inArray(teamResources.id, ids)).orderBy(asc(teamResources.id)).for("update");
    for (const row of rows) await requireActiveResource(row.id, tx);
    if (rows.length !== ids.length || rows.some((row) => row.teamId !== source.teamId)) throw new ForbiddenError("资料已不可访问，请重新选择");
    const rights = await lockResourceRead(actorId, source, tx); if (!rights.edit) throw new ForbiddenError("需要资料编辑权限才能建立关联");
    if (target) await accessScope(actorId, { teamId: target.teamId, projectId: target.projectId ?? undefined }, tx);
    const [existing] = await tx.select().from(resourceLinks).where(task ? and(eq(resourceLinks.sourceResourceId, source.id), eq(resourceLinks.targetTaskId, task.id)) : or(and(eq(resourceLinks.sourceResourceId, source.id), eq(resourceLinks.targetResourceId, target!.id)), and(eq(resourceLinks.sourceResourceId, target!.id), eq(resourceLinks.targetResourceId, source.id))));
    if (existing) return { id: existing.id };
    const [created] = await tx.insert(resourceLinks).values({ sourceResourceId: source.id, targetResourceId: target?.id ?? null, targetTaskId: task?.id ?? null, createdById: actorId }).returning({ id: resourceLinks.id });
    return created;
  });
}
export async function unlinkResource(actorId: string, linkId: string) {
  const [initial] = await db.select().from(resourceLinks).where(eq(resourceLinks.id, linkId)); if (!initial) throw new NotFoundError("关联不存在");
  const resource = await getResource(actorId, initial.sourceResourceId);
  if (initial.targetResourceId) await getResource(actorId, initial.targetResourceId);
  if (initial.targetTaskId) await getTaskDetail(actorId, initial.targetTaskId);
  await db.transaction(async (tx) => { const rights = await lockResourceRead(actorId, resource, tx); if (!rights.edit) throw new ForbiddenError("需要来源资料编辑权限才能移除关联"); await tx.delete(resourceLinks).where(and(eq(resourceLinks.id, linkId), eq(resourceLinks.sourceResourceId, resource.id))); });
}
export async function listResourceLinks(actorId: string, resourceId: string): Promise<ResourceLinkDTO[]> {
  const source = await getResource(actorId, resourceId);
  const visible = await listResources(actorId, source.projectId ? { projectId: source.projectId } : { teamId: source.teamId });
  const rows = await db.select().from(resourceLinks).where(or(eq(resourceLinks.sourceResourceId, resourceId), eq(resourceLinks.targetResourceId, resourceId))).orderBy(desc(resourceLinks.createdAt));
  const links: ResourceLinkDTO[] = [];
  for (const row of rows) {
    const origin = visible.find((item) => item.id === row.sourceResourceId); if (!origin) continue;
    const incoming = row.sourceResourceId !== source.id;
    if (row.targetResourceId) { const target = visible.find((item) => item.id === (incoming ? row.sourceResourceId : row.targetResourceId)); if (target) links.push({ id: row.id, kind: "resource", targetId: target.id, title: target.title, href: resourceHref(target), direction: incoming ? "incoming" : "outgoing", canRemove: !!origin.canEdit }); }
    else if (row.targetTaskId) { try { const task = await getTaskDetail(actorId, row.targetTaskId); if (!source.projectId || source.projectId === task.projectId) links.push({ id: row.id, kind: "task", targetId: task.id, title: task.title, href: `/p/${task.projectId}/tasks/${task.id}`, direction: "outgoing", canRemove: !!origin.canEdit }); } catch (e) { if (!(e instanceof ForbiddenError || e instanceof NotFoundError)) throw e; } }
  }
  const actionItems = await db.select({ taskId: taskActionItemOrigins.taskId, sourceVersion: taskActionItemOrigins.sourceVersion, projectId: tasks.projectId, title: tasks.title }).from(taskActionItemOrigins).innerJoin(tasks, eq(tasks.id, taskActionItemOrigins.taskId)).where(eq(taskActionItemOrigins.resourceId, resourceId));
  for (const item of actionItems) {
    if (source.projectId && item.projectId !== source.projectId) continue;
    await accessScope(actorId, { projectId: item.projectId });
    links.push({ id: item.taskId, kind: "task", targetId: item.taskId, title: `${item.title} · 文档行动项 v${item.sourceVersion}`, href: `/p/${item.projectId}/tasks/${item.taskId}`, direction: "outgoing", canRemove: false });
  }
  return links;
}
export async function listTaskResourceLinks(actorId: string, taskId: string) {
  const task = await getTaskDetail(actorId, taskId); const resources = await listResources(actorId, { projectId: task.projectId });
  const rows = await db.select().from(resourceLinks).where(eq(resourceLinks.targetTaskId, taskId)).orderBy(desc(resourceLinks.createdAt));
  const links = rows.flatMap((row) => { const resource = resources.find((item) => item.id === row.sourceResourceId); return resource ? [{ id: row.id, kind: "resource" as const, targetId: resource.id, title: resource.title, href: `/p/${task.projectId}/resources?resource=${resource.id}`, direction: "incoming" as const, canRemove: !!resource.canEdit }] : []; });
  const [origin] = await db.select().from(taskActionItemOrigins).where(eq(taskActionItemOrigins.taskId, task.id));
  const originResource = resources.find((row) => row.id === origin?.resourceId);
  if (origin && originResource) links.unshift({ id: task.id, kind: "resource", targetId: originResource.id, title: `${originResource.title} · 行动项来源 v${origin.sourceVersion}`, href: `/p/${task.projectId}/resources?resource=${originResource.id}`, direction: "incoming", canRemove: false });
  return { resources: resources.map((row) => ({ id: row.id, title: row.title, kind: row.kind, canEdit: !!row.canEdit })), links };
}
export async function getResourceWorkspace(actorId: string, scope: Scope) {
  const access = await accessScope(actorId, scope);
  return { folders: await listResourceFolders(actorId, scope), members: await db.select({ id: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, access.teamId)).orderBy(asc(users.name)), tasks: scope.projectId ? (await listProjectTasks(actorId, scope.projectId)).map((row) => ({ id: row.id, title: row.title })) : [] };
}

function commentDTO(row: typeof resourceComments.$inferSelect, actorId: string, resource: ResourceDTO, authorName: string | null, mentions: { userId: string | null; name: string }[]): ResourceCommentDTO {
  return { ...row, body: row.withdrawn ? "" : row.body, authorName, mentions, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), canEdit: !row.withdrawn && row.createdById === actorId && !!resource.canComment, canWithdraw: !row.withdrawn && (row.createdById === actorId || resource.canManage), canResolve: !row.withdrawn && !row.parentId && resource.canManage };
}
export async function listResourceComments(actorId: string, resourceId: string) {
  const resource = await getResource(actorId, resourceId);
  const rows = await db.select({ comment: resourceComments, authorName: users.name }).from(resourceComments).leftJoin(users, eq(users.id, resourceComments.createdById)).where(eq(resourceComments.resourceId, resourceId)).orderBy(asc(resourceComments.createdAt), asc(resourceComments.id));
  const mentions = rows.length ? await db.select({ commentId: resourceCommentMentions.commentId, userId: resourceCommentMentions.userId, name: resourceCommentMentions.name }).from(resourceCommentMentions).innerJoin(resourceComments, and(eq(resourceComments.id, resourceCommentMentions.commentId), eq(resourceComments.version, resourceCommentMentions.commentVersion))).where(inArray(resourceCommentMentions.commentId, rows.map((row) => row.comment.id))) : [];
  return rows.map((row) => commentDTO(row.comment, actorId, resource, row.authorName, mentions.filter((mention) => mention.commentId === row.comment.id).map(({ userId, name }) => ({ userId, name }))));
}
async function saveCommentMentions(tx: DbTx, commentId: string, version: number, teamId: string, mentionedUserIds: string[]) {
  const ids = [...new Set(mentionedUserIds)]; if (!ids.length) return;
  const selected = await tx.select({ userId: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(and(eq(teamMembers.teamId, teamId), inArray(teamMembers.userId, ids)));
  if (selected.length !== ids.length) throw new ForbiddenError("只能提及当前团队成员");
  await tx.insert(resourceCommentMentions).values(selected.map((row) => ({ commentId, commentVersion: version, userId: row.userId, name: row.name })));
}
async function commentNotice(actorId: string, resource: ResourceDTO, comment: typeof resourceComments.$inferSelect, mentionedUserIds: string[], tx: DbTx) {
  const parent = comment.parentId ? (await tx.select().from(resourceComments).where(eq(resourceComments.id, comment.parentId)))[0] : null;
  const related = await tx.select({ userId: resourceCollaborators.userId }).from(resourceCollaborators).where(eq(resourceCollaborators.resourceId, resource.id));
  const participants = [resource.createdById, parent?.createdById, ...related.map((row) => row.userId)].filter((id): id is string => !!id);
  await enqueueCollaborationNotice(actorId, { target: { kind: "resource", id: resource.id }, event: "resource_comment", title: `${comment.parentId ? "回复" : "评论"}：${resource.title}`, body: comment.body.slice(0, 300), link: `${resourceHref(resource)}#resource-comment-${comment.id}`, mentionedUserIds, participantUserIds: participants, eventKey: `resource-comment:${comment.id}:${comment.version}` }, tx);
}
export async function createResourceComment(actorId: string, input: z.input<typeof commentInputSchema>) {
  const v = parsed(commentInputSchema, input); const resource = await getResource(actorId, v.resourceId);
  const id = await db.transaction(async (tx) => {
    const access = await lockResourceRead(actorId, resource, tx); if (!access.comment) throw new ForbiddenError("此资料仅允许指定协作者评论");
    if (access.row.version !== v.resourceVersion) throw new ConflictError("资料正文已更新，请保留评论并对照最新版本后提交");
    const parent = v.parentId ? (await tx.select().from(resourceComments).where(and(eq(resourceComments.id, v.parentId), eq(resourceComments.resourceId, resource.id))).for("update"))[0] : null;
    if (v.parentId && (!parent || parent.parentId)) throw new AppError("请选择当前资料的顶层评论回复");
    if (parent?.withdrawn || parent?.resolved) throw new ConflictError("该评论已撤回或解决，请另建评论");
    if (!parent && v.selectedQuote && !access.row.body?.includes(v.selectedQuote)) throw new AppError("所选引文不在当前正文中，请重新选取");
    if (!parent && v.line && (v.line > (access.row.body ?? "").split("\n").length || !access.row.body || (v.selectedQuote && !(access.row.body.split("\n")[v.line - 1] ?? "").includes(v.selectedQuote)))) throw new AppError("评论行号与所选正文不匹配，请重新选取");
    const [created] = await tx.insert(resourceComments).values({ resourceId: resource.id, body: v.body, parentId: parent?.id ?? null, resourceVersion: parent?.resourceVersion ?? v.resourceVersion, selectedQuote: parent?.selectedQuote ?? v.selectedQuote, line: parent?.line ?? v.line, createdById: actorId }).returning();
    await tx.insert(resourceCommentRevisions).values({ commentId: created.id, version: 1, body: created.body, kind: "create", changedById: actorId });
    await saveCommentMentions(tx, created.id, 1, resource.teamId, v.mentionedUserIds);
    await commentNotice(actorId, resource, created, v.mentionedUserIds, tx);
    return created.id;
  });
  return (await listResourceComments(actorId, resource.id)).find((row) => row.id === id)!;
}
export async function updateResourceComment(actorId: string, input: z.input<typeof commentPatchSchema>) {
  const v = parsed(commentPatchSchema, input); const [initial] = await db.select().from(resourceComments).where(eq(resourceComments.id, v.commentId)); if (!initial) throw new NotFoundError("评论不存在");
  const resource = await getResource(actorId, initial.resourceId);
  await db.transaction(async (tx) => {
    const access = await lockResourceRead(actorId, resource, tx); const [row] = await tx.select().from(resourceComments).where(eq(resourceComments.id, initial.id)).for("update"); if (!row) throw new NotFoundError("评论不存在");
    if (row.version !== v.version) throw new ConflictError("评论已更新，请保留输入并获取最新版本");
    if (row.withdrawn) throw new ConflictError("已撤回评论不能再次修改");
    const author = row.createdById === actorId;
    if (v.action === "edit" && (!author || !access.comment)) throw new ForbiddenError("仅作者在具有评论权限时可修改评论");
    if (v.action === "withdraw" && !author && !access.manage) throw new ForbiddenError("仅评论作者或资料管理者可撤回");
    if ((v.action === "resolve" || v.action === "reopen") && (!access.manage || !!row.parentId)) throw new ForbiddenError("仅资料作者或团队管理员可解决顶层评论");
    if (v.action === "edit" && !v.body) throw new AppError("请填写修改后的评论");
    if (v.action === "resolve" && row.resolved || v.action === "reopen" && !row.resolved) throw new ConflictError("评论处理状态已变化，请刷新后重试");
    const [updated] = await tx.update(resourceComments).set({ body: v.action === "edit" ? v.body : row.body, withdrawn: v.action === "withdraw", resolved: v.action === "resolve" ? true : v.action === "reopen" ? false : row.resolved, version: row.version + 1, updatedAt: new Date() }).where(eq(resourceComments.id, row.id)).returning();
    await tx.insert(resourceCommentRevisions).values({ commentId: row.id, version: updated.version, body: updated.body, kind: v.action, changedById: actorId });
    if (v.action === "edit") await saveCommentMentions(tx, row.id, updated.version, resource.teamId, v.mentionedUserIds);
    else { const previous = await tx.select().from(resourceCommentMentions).where(and(eq(resourceCommentMentions.commentId, row.id), eq(resourceCommentMentions.commentVersion, row.version))); if (previous.length) await tx.insert(resourceCommentMentions).values(previous.map((mention) => ({ commentId: row.id, commentVersion: updated.version, userId: mention.userId, name: mention.name }))); }
    if (v.action === "edit") await commentNotice(actorId, resource, updated, v.mentionedUserIds, tx);
  });
  return (await listResourceComments(actorId, resource.id)).find((row) => row.id === initial.id)!;
}
export async function listResourceCommentHistory(actorId: string, commentId: string) {
  const [comment] = await db.select().from(resourceComments).where(eq(resourceComments.id, commentId)); if (!comment) throw new NotFoundError("评论不存在"); await getResource(actorId, comment.resourceId);
  const mentions = await db.select().from(resourceCommentMentions).where(eq(resourceCommentMentions.commentId, commentId));
  return (await db.select({ id: resourceCommentRevisions.id, version: resourceCommentRevisions.version, body: resourceCommentRevisions.body, kind: resourceCommentRevisions.kind, authorName: users.name, createdAt: resourceCommentRevisions.createdAt }).from(resourceCommentRevisions).leftJoin(users, eq(users.id, resourceCommentRevisions.changedById)).where(eq(resourceCommentRevisions.commentId, commentId)).orderBy(desc(resourceCommentRevisions.version))).map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), mentions: mentions.filter((mention) => mention.commentVersion === row.version).map(({ userId, name }) => ({ userId, name })) }));
}

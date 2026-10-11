import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { discussionResourceReferences, memberPositions, projects, resourceReferences, resourceRevisions, resourceCollaboration, resourceCollaborators, resourceFolderCategories, resourceFolders, resourceLinks, resourcePlacements, resourceTrash, taskActionItemOrigins, teamMembers, teamResources, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser, requireTeamRole } from "@/modules/core";
import { RESOURCE_MAX_BYTES, decodeMaterialText, type ResourceDTO, type ResourceTrashDTO } from "./client";
import { resourceInputSchema, resourcePatchSchema, resourceRestoreSchema, scopeSchema, uploadPlacementSchema } from "./schema";
import type { z } from "zod";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { enqueueCollaborationNotice } from "@/modules/notify";

export async function accessScope(actorId: string, input: { teamId?: string; projectId?: string }, tx?: DbTx) {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("请选择有效的团队或项目");
  const project = input.projectId ? tx ? (await tx.select().from(projects).where(eq(projects.id, input.projectId)))[0] : (await requireProjectForUser(actorId, input.projectId)).project : null;
  if (input.projectId && !project) throw new ForbiddenError();
  if (project && input.teamId && project.teamId !== input.teamId) throw new ForbiddenError();
  const teamId = project?.teamId ?? input.teamId!;
  const membership = tx ? (await tx.select({ member: teamMembers, positions: memberPositions.positions }).from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id)).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId))))[0] : null;
  if (tx && !membership) throw new ForbiddenError();
  const member = membership ? { ...membership.member, positions: membership.positions ?? positionsFromRole(membership.member.role) } : await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  return { teamId, projectId: project?.id ?? null, member };
}

type Row = typeof teamResources.$inferSelect;
function toDTO(row: Row & { referenced?: boolean; folderId?: string | null; placementVersion?: number; pinned?: boolean; permission?: string | null; commentScope?: string }, actorId: string, admin: boolean, authorName: string | null): ResourceDTO {
  const { contentBase64, ...visible } = row;
  void contentBase64;
  const canManage = admin || row.createdById === actorId;
  const canEdit = canManage || row.kind !== "file" && row.permission === "edit";
  return { ...visible, referenced: row.referenced ?? false, category: row.category as ResourceDTO["category"], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), authorName, canManage, canEdit, canComment: canManage || !!row.permission || row.commentScope !== "collaborators" };
}
const metadata = {
  id: teamResources.id, teamId: teamResources.teamId, projectId: teamResources.projectId, kind: teamResources.kind,
  title: teamResources.title, body: teamResources.body, url: teamResources.url, fileName: teamResources.fileName,
  mimeType: teamResources.mimeType, size: teamResources.size, tags: teamResources.tags, category: teamResources.category,
  version: teamResources.version, createdById: teamResources.createdById, updatedById: teamResources.updatedById,
  createdAt: teamResources.createdAt, updatedAt: teamResources.updatedAt,
  referenced: sql<boolean>`exists (select 1 from ${resourceReferences} where ${resourceReferences.resourceId} = ${teamResources.id}) or exists (select 1 from ${discussionResourceReferences} where ${discussionResourceReferences.resourceId} = ${teamResources.id}) or exists (select 1 from ${taskActionItemOrigins} where ${taskActionItemOrigins.resourceId} = ${teamResources.id}) or exists (select 1 from ${resourceLinks} where ${resourceLinks.sourceResourceId} = ${teamResources.id} or ${resourceLinks.targetResourceId} = ${teamResources.id})`,
};
const activeResource = sql`not exists (select 1 from ${resourceTrash} where ${resourceTrash.resourceId} = ${teamResources.id})`;
export async function requireActiveResource(id: string, tx: DbTx) {
  const [trash] = await tx.select({ id: resourceTrash.resourceId }).from(resourceTrash).where(eq(resourceTrash.resourceId, id));
  if (trash) throw new NotFoundError("资料已移至回收站，请由作者或资料管理员恢复后使用");
}
async function initialPlacement(tx: DbTx, row: Row, folderId: string | null) {
  if (!folderId) return;
  const [folder] = await tx.select({ folder: resourceFolders, category: resourceFolderCategories.category }).from(resourceFolders).leftJoin(resourceFolderCategories, eq(resourceFolderCategories.folderId, resourceFolders.id)).where(eq(resourceFolders.id, folderId));
  if (!folder || folder.folder.teamId !== row.teamId || folder.folder.projectId !== row.projectId) throw new ForbiddenError("请在当前资料所属空间选择主题文件夹");
  if ((folder.category ?? "general") !== row.category) throw new ConflictError("主题文件夹属于其他分类，请重新选择保存位置");
  await tx.insert(resourcePlacements).values({ resourceId: row.id, folderId });
}
function workspaceMetadata(actorId: string) {
  return {
    ...metadata,
    folderId: sql<string | null>`(select ${resourcePlacements.folderId} from ${resourcePlacements} where ${resourcePlacements.resourceId} = ${teamResources.id})`,
    placementVersion: sql<number>`coalesce((select ${resourcePlacements.version} from ${resourcePlacements} where ${resourcePlacements.resourceId} = ${teamResources.id}), 1)`,
    pinned: sql<boolean>`coalesce((select ${resourcePlacements.pinned} from ${resourcePlacements} where ${resourcePlacements.resourceId} = ${teamResources.id}), false)`,
    permission: sql<string | null>`(select ${resourceCollaborators.permission} from ${resourceCollaborators} where ${resourceCollaborators.resourceId} = ${teamResources.id} and ${resourceCollaborators.userId} = ${actorId})`,
    commentScope: sql<string>`coalesce((select ${resourceCollaboration.commentScope} from ${resourceCollaboration} where ${resourceCollaboration.resourceId} = ${teamResources.id}), 'team')`,
  };
}

export async function listResources(actorId: string, scope: { teamId?: string; projectId?: string }): Promise<ResourceDTO[]> {
  const access = await accessScope(actorId, scope);
  const rows = await db.select({ ...workspaceMetadata(actorId), authorName: users.name }).from(teamResources)
    .leftJoin(users, eq(users.id, teamResources.createdById)).where(and(eq(teamResources.teamId, access.teamId), activeResource, access.projectId ? or(eq(teamResources.projectId, access.projectId), isNull(teamResources.projectId)) : undefined)).orderBy(desc(teamResources.updatedAt));
  return rows.map((row) => toDTO({ ...row, contentBase64: null }, actorId, capabilitiesFor(access.member.positions).manageResources, row.authorName));
}

export async function getResource(actorId: string, id: string): Promise<ResourceDTO> {
  const [row] = await db.select({ ...workspaceMetadata(actorId), authorName: users.name }).from(teamResources).leftJoin(users, eq(users.id, teamResources.createdById)).where(and(eq(teamResources.id, id), activeResource));
  if (!row) throw new NotFoundError("资料不存在");
  const access = await accessScope(actorId, { teamId: row.teamId, projectId: row.projectId ?? undefined });
  return toDTO({ ...row, contentBase64: null }, actorId, capabilitiesFor(access.member.positions).manageResources, row.authorName);
}

export async function createResource(actorId: string, input: z.input<typeof resourceInputSchema>): Promise<ResourceDTO> {
  const access = await accessScope(actorId, input);
  const parsed = resourceInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const v = parsed.data;
  const row = await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, access.teamId)).for("update");
    await accessScope(actorId, input, tx);
    const [created] = await tx.insert(teamResources).values({ teamId: access.teamId, projectId: access.projectId, kind: v.kind, title: v.title, body: v.kind === "document" ? v.body ?? "" : null, url: v.kind === "link" ? v.url : null, tags: v.tags, category: v.category, createdById: actorId, updatedById: actorId }).returning();
    if (v.kind === "document") await tx.insert(resourceRevisions).values({ resourceId: created.id, version: 1, title: created.title, body: created.body ?? "", createdById: actorId });
    await initialPlacement(tx, created, v.folderId);
    return created;
  });
  return getResource(actorId, row.id);
}

const MIMES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", txt: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };
export async function uploadResource(actorId: string, scope: { teamId?: string; projectId?: string }, file: { name: string; bytes: Uint8Array }, title?: string, placement: z.input<typeof uploadPlacementSchema> = {}): Promise<ResourceDTO> {
  const access = await accessScope(actorId, scope);
  const parsed = uploadPlacementSchema.safeParse(placement); if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIMES[ext];
  if (!mime || /[\u0000-\u001f/\\]/.test(file.name) || file.name.length > 200) throw new AppError("不支持此文件名或格式，请使用 PDF、图片、文本、Office 或 ZIP");
  if (!file.bytes.length || file.bytes.length > RESOURCE_MAX_BYTES) throw new AppError("文件需大于 0 字节且不超过 10 MB");
  const b = Buffer.from(file.bytes);
  if (ext === "pdf" && b.subarray(0, 5).toString() !== "%PDF-") throw new AppError("PDF 文件内容无效");
  if (ext === "png" && b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new AppError("PNG 图片内容无效");
  if (["jpg", "jpeg"].includes(ext) && b.subarray(0, 3).toString("hex") !== "ffd8ff") throw new AppError("JPEG 图片内容无效");
  if (ext === "gif" && !["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString())) throw new AppError("GIF 图片内容无效");
  if (ext === "webp" && (b.subarray(0, 4).toString() !== "RIFF" || b.subarray(8, 12).toString() !== "WEBP")) throw new AppError("WebP 图片内容无效");
  if (["docx", "xlsx", "pptx", "zip"].includes(ext) && b.subarray(0, 2).toString() !== "PK") throw new AppError("压缩文档内容无效");
  const isText = ["txt", "md", "markdown", "csv", "tsv", "json"].includes(ext);
  let body: string | null = null;
  if (isText) {
    try { body = decodeMaterialText(b); } catch { throw new AppError("文本编码无法读取，请使用 UTF-8"); }
    if (body.length > 200000) throw new AppError("可整理文本最多 20 万字，请拆分后上传");
    if (ext === "json") { try { JSON.parse(body); } catch { throw new AppError("JSON 文件格式无效"); } }
  }
  const name = (title?.trim() || file.name).slice(0, 160);
  const row = await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, access.teamId)).for("update");
    await accessScope(actorId, scope, tx);
    const [created] = await tx.insert(teamResources).values({ teamId: access.teamId, projectId: access.projectId, kind: "file", title: name, fileName: file.name, mimeType: mime, size: b.length, contentBase64: b.toString("base64"), body, category: parsed.data.category, createdById: actorId, updatedById: actorId }).returning();
    await initialPlacement(tx, created, parsed.data.folderId);
    return created;
  });
  return getResource(actorId, row.id);
}

export async function lockManaged(actorId: string, id: string, tx: DbTx, resource: ResourceDTO, mode: "manage" | "edit" = "manage", allowTrashed = false) {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, resource.teamId)).for("update");
  const access = await accessScope(actorId, { teamId: resource.teamId, projectId: resource.projectId ?? undefined }, tx);
  const [row] = await tx.select().from(teamResources).where(eq(teamResources.id, id)).for("update");
  if (!row) throw new NotFoundError("资料不存在");
  if (!allowTrashed) await requireActiveResource(id, tx);
  if (row.createdById !== actorId && !capabilitiesFor(access.member.positions).manageResources) {
    const [grant] = await tx.select().from(resourceCollaborators).where(and(eq(resourceCollaborators.resourceId, id), eq(resourceCollaborators.userId, actorId)));
    if (mode === "manage" || row.kind === "file" || grant?.permission !== "edit") throw new ForbiddenError(mode === "manage" || row.kind === "file" ? "仅资料作者、管理员或副管理员可管理此资料" : "需要资料编辑权限");
  }
  return row;
}

export async function updateResource(actorId: string, id: string, input: z.input<typeof resourcePatchSchema>) {
  const resource = await getResource(actorId, id);
  const parsed = resourcePatchSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const v = parsed.data;
  await db.transaction(async (tx) => {
    const row = await lockManaged(actorId, id, tx, resource, "edit");
    if (row.version !== v.version) throw new ConflictError("资料已被其他人更新，请保留输入并重新加载最新版本");
    if (row.kind === "file" && v.body !== undefined) throw new AppError("文件内容不能覆盖，请上传新文件");
    if (row.kind === "link" && !v.url) throw new AppError("请填写资料链接");
    const body = row.kind === "document" ? v.body ?? row.body ?? "" : row.body;
    if (v.category !== row.category) await tx.update(resourcePlacements).set({ folderId: null, version: sql`${resourcePlacements.version} + 1`, updatedAt: new Date() }).where(eq(resourcePlacements.resourceId, id));
    await tx.update(teamResources).set({ title: v.title, tags: v.tags, category: v.category, body, url: row.kind === "link" ? v.url : row.url, version: row.version + 1, updatedById: actorId, updatedAt: new Date() }).where(eq(teamResources.id, id));
    if (row.kind === "document") await tx.insert(resourceRevisions).values({ resourceId: id, version: row.version + 1, title: v.title, body: body ?? "", createdById: actorId });
    const collaborators = await tx.select({ userId: resourceCollaborators.userId }).from(resourceCollaborators).where(eq(resourceCollaborators.resourceId, id));
    await enqueueCollaborationNotice(actorId, { target: { kind: "resource", id }, event: "resource_update", title: `资料更新：${v.title}`, body: `已保存 v${row.version + 1}，可查看正文和历史版本。`, link: row.projectId ? `/p/${row.projectId}/resources?resource=${id}` : `/t/${row.teamId}/resources?resource=${id}`, mentionedUserIds: v.mentionedUserIds, participantUserIds: [row.createdById, ...collaborators.map((grant) => grant.userId)].filter((userId): userId is string => !!userId), eventKey: `resource-update:${id}:${row.version + 1}` }, tx);
  });
  return getResource(actorId, id);
}

export async function deleteResource(actorId: string, id: string, version: number) {
  const resource = await getResource(actorId, id);
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("资料版本无效");
  await db.transaction(async (tx) => {
    const row = await lockManaged(actorId, id, tx, resource);
    if (row.version !== version) throw new ConflictError("资料版本已变化，请刷新后重试");
    const [reference] = await tx.select({ id: resourceReferences.id }).from(resourceReferences).where(eq(resourceReferences.resourceId, id)).limit(1);
    const [discussionReference] = await tx.select({ id: discussionResourceReferences.id }).from(discussionResourceReferences).where(eq(discussionResourceReferences.resourceId, id)).limit(1);
    const [actionItem] = await tx.select({ taskId: taskActionItemOrigins.taskId }).from(taskActionItemOrigins).where(eq(taskActionItemOrigins.resourceId, id)).limit(1);
    const [link] = await tx.select({ id: resourceLinks.id }).from(resourceLinks).where(or(eq(resourceLinks.sourceResourceId, id), eq(resourceLinks.targetResourceId, id))).limit(1);
    if (reference || discussionReference || actionItem || link) throw new ConflictError("此资料已关联成果、讨论、行动项或其他内容，不能回收；普通互链可先解除");
    const nextVersion = row.version + 1;
    await tx.insert(resourceTrash).values({ resourceId: id, version: nextVersion, trashedById: actorId });
    await tx.update(teamResources).set({ version: nextVersion, updatedAt: new Date(), updatedById: actorId }).where(eq(teamResources.id, id));
  });
}

export async function listResourceTrash(actorId: string, scope: { teamId?: string; projectId?: string }): Promise<ResourceTrashDTO[]> {
  const access = await accessScope(actorId, scope); const manage = capabilitiesFor(access.member.positions).manageResources;
  const rows = await db.select({ ...workspaceMetadata(actorId), authorName: users.name, trashedAt: resourceTrash.trashedAt, trashedById: resourceTrash.trashedById }).from(teamResources).innerJoin(resourceTrash, eq(resourceTrash.resourceId, teamResources.id)).leftJoin(users, eq(users.id, teamResources.createdById)).where(and(eq(teamResources.teamId, access.teamId), access.projectId ? or(eq(teamResources.projectId, access.projectId), isNull(teamResources.projectId)) : undefined, manage ? undefined : eq(teamResources.createdById, actorId))).orderBy(desc(resourceTrash.trashedAt));
  const ids = [...new Set(rows.map((row) => row.trashedById).filter((id): id is string => !!id))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  return rows.map((row) => ({ ...toDTO({ ...row, contentBase64: null }, actorId, manage, row.authorName), trashedAt: row.trashedAt.toISOString(), trashedByName: people.find((person) => person.id === row.trashedById)?.name ?? null }));
}
export async function restoreResource(actorId: string, input: z.input<typeof resourceRestoreSchema>): Promise<ResourceDTO> {
  const parsed = resourceRestoreSchema.safeParse(input); if (!parsed.success) throw new AppError(parsed.error.issues[0].message); const v = parsed.data;
  const [initial] = await db.select({ ...workspaceMetadata(actorId), authorName: users.name }).from(teamResources).leftJoin(users, eq(users.id, teamResources.createdById)).where(eq(teamResources.id, v.resourceId));
  if (!initial) throw new NotFoundError("资料不存在");
  const access = await accessScope(actorId, { teamId: initial.teamId, projectId: initial.projectId ?? undefined });
  const resource = toDTO({ ...initial, contentBase64: null }, actorId, capabilitiesFor(access.member.positions).manageResources, initial.authorName);
  await db.transaction(async (tx) => {
    const row = await lockManaged(actorId, v.resourceId, tx, resource, "manage", true);
    const [trash] = await tx.select().from(resourceTrash).where(eq(resourceTrash.resourceId, row.id));
    if (!trash) throw new ConflictError("此资料已恢复，请刷新资料列表");
    if (row.version !== v.version || trash.version !== v.version) throw new ConflictError("回收资料版本已变化，请刷新回收站后重试");
    await tx.delete(resourceTrash).where(eq(resourceTrash.resourceId, row.id));
    await tx.update(teamResources).set({ version: row.version + 1, updatedAt: new Date(), updatedById: actorId }).where(eq(teamResources.id, row.id));
    if (row.kind === "document") await tx.insert(resourceRevisions).values({ resourceId: row.id, version: row.version + 1, title: row.title, body: row.body ?? "", createdById: actorId });
  });
  return getResource(actorId, v.resourceId);
}

export async function listResourceRevisions(actorId: string, id: string) {
  await getResource(actorId, id);
  return (await db.select({ id: resourceRevisions.id, version: resourceRevisions.version, title: resourceRevisions.title, body: resourceRevisions.body, createdAt: resourceRevisions.createdAt, authorName: users.name }).from(resourceRevisions).leftJoin(users, eq(users.id, resourceRevisions.createdById)).where(eq(resourceRevisions.resourceId, id)).orderBy(desc(resourceRevisions.version))).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getResourceFile(actorId: string, id: string) {
  const resource = await getResource(actorId, id);
  const [row] = await db.select({ content: teamResources.contentBase64 }).from(teamResources).where(and(eq(teamResources.id, id), activeResource));
  if (resource.kind !== "file" || !row?.content) throw new NotFoundError("文件不存在");
  return { resource, bytes: Buffer.from(row.content, "base64") };
}

export async function bindSubmissionResources(actorId: string, projectId: string, resourceIds: string[], submissionId: string, tx: DbTx) {
  const access = await accessScope(actorId, { projectId }, tx);
  const ids = [...new Set(resourceIds)].sort();
  if (ids.length > 10) throw new AppError("每次提交最多关联 10 份文件");
  if (!ids.length) return [];
  const rows = await tx.select().from(teamResources).where(inArray(teamResources.id, ids)).orderBy(teamResources.id).for("update");
  for (const row of rows) await requireActiveResource(row.id, tx);
  if (rows.length !== ids.length || rows.some((row) => row.teamId !== access.teamId || (row.projectId !== null && row.projectId !== projectId) || row.kind !== "file")) throw new ForbiddenError("只能关联当前项目或团队共享的文件");
  await tx.insert(resourceReferences).values(rows.map((row) => ({ resourceId: row.id, submissionId })));
  return rows.map(({ id, title, fileName, mimeType, size }) => ({ id, title, fileName, mimeType, size }));
}

export async function bindDiscussionResources(actorId: string, projectId: string, resourceIds: string[], postId: string, tx: DbTx) {
  const access = await accessScope(actorId, { projectId }, tx);
  const ids = [...new Set(resourceIds)].sort();
  if (ids.length > 10) throw new AppError("每条讨论最多关联 10 份文件");
  if (!ids.length) return [];
  const rows = await tx.select().from(teamResources).where(inArray(teamResources.id, ids)).orderBy(teamResources.id).for("update");
  for (const row of rows) await requireActiveResource(row.id, tx);
  if (rows.length !== ids.length || rows.some((row) => row.teamId !== access.teamId || (row.projectId !== null && row.projectId !== projectId) || row.kind !== "file")) throw new ForbiddenError("只能关联当前项目或团队共享的文件");
  await tx.insert(discussionResourceReferences).values(rows.map((row) => ({ resourceId: row.id, postId })));
  return rows.map(({ id, title, fileName, mimeType, size }) => ({ id, title, fileName, mimeType, size }));
}

export async function bindTaskActionItemSource(actorId: string, projectId: string, input: { resourceId: string; sourceVersion: number; quote?: string }, tx: DbTx) {
  const access = await accessScope(actorId, { projectId }, tx);
  const [row] = await tx.select().from(teamResources).where(eq(teamResources.id, input.resourceId)).for("update");
  if (row) await requireActiveResource(row.id, tx);
  if (!row || row.teamId !== access.teamId || row.projectId !== null && row.projectId !== projectId) throw new ForbiddenError("行动项来源需为当前项目或团队共享文档");
  if (row.kind !== "document") throw new AppError("请从可编辑文档创建行动项");
  if (!Number.isSafeInteger(input.sourceVersion) || row.version !== input.sourceVersion) throw new ConflictError("文档已更新，请保留行动项输入并对照最新版本后提交");
  if (input.quote?.trim() && !row.body?.includes(input.quote.trim())) throw new ConflictError("所选引文不在当前正文中，请保留输入并重新选取");
  return { id: row.id, title: row.title, version: row.version };
}

export async function accessibleResourceIds(actorId: string, resourceIds: string[], tx?: DbTx): Promise<string[]> {
  const ids = [...new Set(resourceIds)]; if (!ids.length) return [];
  const connection = tx ?? db;
  const rows = await connection.select({ id: teamResources.id }).from(teamResources).innerJoin(teamMembers, and(eq(teamMembers.teamId, teamResources.teamId), eq(teamMembers.userId, actorId))).where(and(inArray(teamResources.id, ids), activeResource));
  return rows.map((row) => row.id);
}

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, projects, resourceReferences, resourceRevisions, teamMembers, teamResources, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser, requireTeamRole } from "@/modules/core";
import { RESOURCE_MAX_BYTES, decodeMaterialText, type ResourceDTO } from "./client";
import { resourceInputSchema, resourcePatchSchema, scopeSchema } from "./schema";
import type { z } from "zod";
import { positionsFromRole } from "@/modules/identity/client";

async function accessScope(actorId: string, input: { teamId?: string; projectId?: string }, tx?: DbTx) {
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
function toDTO(row: Row & { referenced?: boolean }, actorId: string, admin: boolean, authorName: string | null): ResourceDTO {
  const { contentBase64, ...visible } = row;
  void contentBase64;
  return { ...visible, referenced: row.referenced ?? false, category: row.category as ResourceDTO["category"], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), authorName, canManage: admin || row.createdById === actorId };
}
const metadata = {
  id: teamResources.id, teamId: teamResources.teamId, projectId: teamResources.projectId, kind: teamResources.kind,
  title: teamResources.title, body: teamResources.body, url: teamResources.url, fileName: teamResources.fileName,
  mimeType: teamResources.mimeType, size: teamResources.size, tags: teamResources.tags, category: teamResources.category,
  version: teamResources.version, createdById: teamResources.createdById, updatedById: teamResources.updatedById,
  createdAt: teamResources.createdAt, updatedAt: teamResources.updatedAt,
  referenced: sql<boolean>`exists (select 1 from ${resourceReferences} where ${resourceReferences.resourceId} = ${teamResources.id})`,
};

export async function listResources(actorId: string, scope: { teamId?: string; projectId?: string }): Promise<ResourceDTO[]> {
  const access = await accessScope(actorId, scope);
  const rows = await db.select({ ...metadata, authorName: users.name }).from(teamResources)
    .leftJoin(users, eq(users.id, teamResources.createdById)).where(and(eq(teamResources.teamId, access.teamId), access.projectId ? or(eq(teamResources.projectId, access.projectId), isNull(teamResources.projectId)) : undefined)).orderBy(desc(teamResources.updatedAt));
  return rows.map((row) => toDTO({ ...row, contentBase64: null }, actorId, access.member.positions.includes("admin"), row.authorName));
}

export async function getResource(actorId: string, id: string): Promise<ResourceDTO> {
  const [row] = await db.select({ ...metadata, authorName: users.name }).from(teamResources).leftJoin(users, eq(users.id, teamResources.createdById)).where(eq(teamResources.id, id));
  if (!row) throw new NotFoundError("资料不存在");
  const access = await accessScope(actorId, { teamId: row.teamId, projectId: row.projectId ?? undefined });
  return toDTO({ ...row, contentBase64: null }, actorId, access.member.positions.includes("admin"), row.authorName);
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
    return created;
  });
  return getResource(actorId, row.id);
}

const MIMES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", txt: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };
export async function uploadResource(actorId: string, scope: { teamId?: string; projectId?: string }, file: { name: string; bytes: Uint8Array }, title?: string): Promise<ResourceDTO> {
  const access = await accessScope(actorId, scope);
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
    const [created] = await tx.insert(teamResources).values({ teamId: access.teamId, projectId: access.projectId, kind: "file", title: name, fileName: file.name, mimeType: mime, size: b.length, contentBase64: b.toString("base64"), body, createdById: actorId, updatedById: actorId }).returning();
    return created;
  });
  return getResource(actorId, row.id);
}

async function lockManaged(actorId: string, id: string, tx: DbTx, resource: ResourceDTO) {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, resource.teamId)).for("update");
  const access = await accessScope(actorId, { teamId: resource.teamId, projectId: resource.projectId ?? undefined }, tx);
  const [row] = await tx.select().from(teamResources).where(eq(teamResources.id, id)).for("update");
  if (!row) throw new NotFoundError("资料不存在");
  if (row.createdById !== actorId && !access.member.positions.includes("admin")) throw new ForbiddenError("仅资料作者或团队管理员可维护此资料");
  return row;
}

export async function updateResource(actorId: string, id: string, input: z.input<typeof resourcePatchSchema>) {
  const resource = await getResource(actorId, id);
  const parsed = resourcePatchSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const v = parsed.data;
  await db.transaction(async (tx) => {
    const row = await lockManaged(actorId, id, tx, resource);
    if (row.version !== v.version) throw new ConflictError("资料已被其他人更新，请保留输入并重新加载最新版本");
    if (row.kind === "file" && v.body !== undefined) throw new AppError("文件内容不能覆盖，请上传新文件");
    if (row.kind === "link" && !v.url) throw new AppError("请填写资料链接");
    const body = row.kind === "document" ? v.body ?? row.body ?? "" : row.body;
    await tx.update(teamResources).set({ title: v.title, tags: v.tags, category: v.category, body, url: row.kind === "link" ? v.url : row.url, version: row.version + 1, updatedById: actorId, updatedAt: new Date() }).where(eq(teamResources.id, id));
    if (row.kind === "document") await tx.insert(resourceRevisions).values({ resourceId: id, version: row.version + 1, title: v.title, body: body ?? "", createdById: actorId });
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
    if (reference) throw new ConflictError("此文件已作为提交证据，不能删除");
    await tx.delete(teamResources).where(eq(teamResources.id, id));
  });
}

export async function listResourceRevisions(actorId: string, id: string) {
  await getResource(actorId, id);
  return (await db.select({ id: resourceRevisions.id, version: resourceRevisions.version, title: resourceRevisions.title, body: resourceRevisions.body, createdAt: resourceRevisions.createdAt, authorName: users.name }).from(resourceRevisions).leftJoin(users, eq(users.id, resourceRevisions.createdById)).where(eq(resourceRevisions.resourceId, id)).orderBy(desc(resourceRevisions.version))).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getResourceFile(actorId: string, id: string) {
  const resource = await getResource(actorId, id);
  const [row] = await db.select({ content: teamResources.contentBase64 }).from(teamResources).where(eq(teamResources.id, id));
  if (resource.kind !== "file" || !row?.content) throw new NotFoundError("文件不存在");
  return { resource, bytes: Buffer.from(row.content, "base64") };
}

export async function bindSubmissionResources(actorId: string, projectId: string, resourceIds: string[], submissionId: string, tx: DbTx) {
  const access = await accessScope(actorId, { projectId }, tx);
  const ids = [...new Set(resourceIds)].sort();
  if (ids.length > 10) throw new AppError("每次提交最多关联 10 份文件");
  if (!ids.length) return [];
  const rows = await tx.select().from(teamResources).where(inArray(teamResources.id, ids)).orderBy(teamResources.id).for("update");
  if (rows.length !== ids.length || rows.some((row) => row.teamId !== access.teamId || (row.projectId !== null && row.projectId !== projectId) || row.kind !== "file")) throw new ForbiddenError("只能关联当前项目或团队共享的文件");
  await tx.insert(resourceReferences).values(rows.map((row) => ({ resourceId: row.id, submissionId })));
  return rows.map(({ id, title, fileName, mimeType, size }) => ({ id, title, fileName, mimeType, size }));
}

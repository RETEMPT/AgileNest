import { and, asc, eq } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, projectComments, projects, teamMembers, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { projectCommentCreateSchema, projectCommentEditSchema, type ProjectCommentCreateInput, type ProjectCommentDTO, type ProjectCommentEditInput, type ProjectCommentListDTO } from "./client";

type CommentRow = typeof projectComments.$inferSelect;
type Access = Awaited<ReturnType<typeof requireProjectForUser>>;

async function projectAccess(actorId: string, projectId: string): Promise<Access> {
  return requireProjectForUser(actorId, projectId);
}

async function lockProjectAccess(tx: DbTx, actorId: string, access: Access): Promise<Access> {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, access.project.teamId)).for("update");
  const [project] = await tx.select().from(projects).where(eq(projects.id, access.project.id));
  if (!project || project.teamId !== access.project.teamId) throw new ConflictError("项目归属已变化，请重新加载");
  const [membership] = await tx.select({ role: teamMembers.role, positions: memberPositions.positions })
    .from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, access.project.teamId), eq(teamMembers.userId, actorId)));
  if (!membership) throw new ForbiddenError("你已不在该团队中");
  return { ...access, capabilities: capabilitiesFor(membership.positions ?? positionsFromRole(membership.role), project.kind) };
}

function toDTO(row: CommentRow, actorId: string, authorName: string | null, canWithdraw: boolean): ProjectCommentDTO {
  const author = row.createdById === actorId;
  return {
    id: row.id, projectId: row.projectId, parentId: row.parentId,
    body: row.withdrawn ? "" : row.body, version: row.version, withdrawn: row.withdrawn,
    createdById: row.createdById, authorName,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    canEdit: !row.withdrawn && author,
    canWithdraw: !row.withdrawn && canWithdraw,
  };
}

export async function listProjectComments(actorId: string, projectId: string): Promise<ProjectCommentListDTO> {
  const access = await projectAccess(actorId, projectId);
  const rows = await db.select({ comment: projectComments, authorName: users.name }).from(projectComments)
    .leftJoin(users, eq(users.id, projectComments.createdById))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt), asc(projectComments.id));
  return { comments: rows.map((row) => toDTO(row.comment, actorId, row.authorName, row.comment.createdById === actorId || access.capabilities.manageMembers)) };
}

async function getComment(actorId: string, projectId: string, commentId: string): Promise<ProjectCommentDTO> {
  const access = await projectAccess(actorId, projectId);
  const [row] = await db.select({ comment: projectComments, authorName: users.name }).from(projectComments)
    .leftJoin(users, eq(users.id, projectComments.createdById))
    .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)));
  if (!row) throw new NotFoundError("评论不存在");
  return toDTO(row.comment, actorId, row.authorName, row.comment.createdById === actorId || access.capabilities.manageMembers);
}

export async function createProjectComment(actorId: string, projectId: string, input: ProjectCommentCreateInput): Promise<ProjectCommentDTO> {
  const access = await projectAccess(actorId, projectId);
  const parsed = projectCommentCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const commentId = await db.transaction(async (tx) => {
    await lockProjectAccess(tx, actorId, access);
    if (parsed.data.parentId) {
      const [parent] = await tx.select().from(projectComments).where(and(eq(projectComments.id, parsed.data.parentId), eq(projectComments.projectId, projectId))).for("update");
      if (!parent) throw new NotFoundError("原评论不存在");
      if (parent.parentId !== null) throw new ConflictError("回复只允许一层，请回复原评论");
      if (parent.withdrawn) throw new ConflictError("此评论已撤回，不能继续回复");
    }
    const [created] = await tx.insert(projectComments).values({ projectId, parentId: parsed.data.parentId ?? null, body: parsed.data.body, createdById: actorId }).returning();
    return created.id;
  });
  return getComment(actorId, projectId, commentId);
}

export async function updateProjectComment(actorId: string, projectId: string, commentId: string, input: ProjectCommentEditInput): Promise<ProjectCommentDTO> {
  const access = await projectAccess(actorId, projectId);
  const parsed = projectCommentEditSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await db.transaction(async (tx) => {
    await lockProjectAccess(tx, actorId, access);
    const [row] = await tx.select().from(projectComments).where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId))).for("update");
    if (!row) throw new NotFoundError("评论不存在");
    if (row.version !== parsed.data.version) throw new ConflictError("评论已更新，请保留草稿并重新加载");
    if (row.withdrawn) throw new ConflictError("评论已撤回");
    if (row.createdById !== actorId) throw new ForbiddenError("仅作者可编辑此评论");
    await tx.update(projectComments).set({ body: parsed.data.body, version: row.version + 1, updatedAt: new Date() }).where(eq(projectComments.id, commentId));
  });
  return getComment(actorId, projectId, commentId);
}

export async function withdrawProjectComment(actorId: string, projectId: string, commentId: string, version: number): Promise<ProjectCommentDTO> {
  const access = await projectAccess(actorId, projectId);
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("评论版本无效");
  await db.transaction(async (tx) => {
    const current = await lockProjectAccess(tx, actorId, access);
    const [row] = await tx.select().from(projectComments).where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId))).for("update");
    if (!row) throw new NotFoundError("评论不存在");
    if (row.version !== version) throw new ConflictError("评论已更新，请重新加载");
    if (row.withdrawn) throw new ConflictError("评论已撤回");
    if (row.createdById !== actorId && !current.capabilities.manageMembers) throw new ForbiddenError("仅作者或团队管理员可撤回此评论");
    await tx.update(projectComments).set({ withdrawn: true, version: row.version + 1, updatedAt: new Date() }).where(eq(projectComments.id, commentId));
  });
  return getComment(actorId, projectId, commentId);
}

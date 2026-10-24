import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbTx } from "@/db";
import { personalTaskViews, projects, teamMembers, teams } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, isUniqueViolation, requireProjectForUser } from "@/modules/core";
import { savedTaskViewDeleteSchema, savedTaskViewInputSchema, savedTaskViewSchema, savedTaskViewUpdateSchema, type SavedTaskViewDTO, type SavedTaskViewInput, type SavedTaskViewUpdate } from "./saved-views-client";

async function projectAccess(actorId: string, projectId: string) {
  if (!z.uuid().safeParse(projectId).success) throw new ForbiddenError("无法访问该项目的保存视图");
  return requireProjectForUser(actorId, projectId);
}

async function lockProjectAccess(tx: DbTx, actorId: string, projectId: string, teamId: string) {
  const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  if (!team) throw new ForbiddenError("无法访问该项目的保存视图");
  const [access] = await tx.select({ id: projects.id }).from(projects)
    .innerJoin(teamMembers, eq(teamMembers.teamId, projects.teamId))
    .where(and(eq(projects.id, projectId), eq(projects.teamId, teamId), eq(teamMembers.userId, actorId)));
  if (!access) throw new ForbiddenError("无法访问该项目的保存视图");
}

async function ownedView(tx: DbTx, actorId: string, projectId: string, viewId: string) {
  if (!z.uuid().safeParse(viewId).success) throw new NotFoundError("保存视图不存在或已删除");
  const [view] = await tx.select().from(personalTaskViews)
    .where(and(eq(personalTaskViews.id, viewId), eq(personalTaskViews.projectId, projectId), eq(personalTaskViews.userId, actorId))).for("update");
  if (!view) throw new NotFoundError("保存视图不存在或已删除");
  return view;
}

function toDTO(view: typeof personalTaskViews.$inferSelect): SavedTaskViewDTO {
  const parsed = savedTaskViewSchema.safeParse({ id: view.id, projectId: view.projectId, name: view.name, layout: view.layout, groupBy: view.groupBy, filters: view.filters, schemaVersion: view.schemaVersion, version: view.version, createdAt: view.createdAt.toISOString(), updatedAt: view.updatedAt.toISOString() });
  if (!parsed.success) throw new AppError("保存视图数据无效，请联系项目管理员");
  return parsed.data;
}

function rethrowSaveError(error: unknown): never {
  if (isUniqueViolation(error)) throw new AppError("你在这个项目已有同名视图，请换一个名称");
  throw error;
}

export async function listMyTaskViews(actorId: string, projectId: string): Promise<SavedTaskViewDTO[]> {
  const access = await projectAccess(actorId, projectId);
  return db.transaction(async (tx) => {
    await lockProjectAccess(tx, actorId, projectId, access.project.teamId);
    const views = await tx.select().from(personalTaskViews).where(and(eq(personalTaskViews.projectId, projectId), eq(personalTaskViews.userId, actorId))).orderBy(desc(personalTaskViews.updatedAt), personalTaskViews.id);
    return views.map(toDTO);
  });
}

export async function createMyTaskView(actorId: string, projectId: string, input: SavedTaskViewInput): Promise<SavedTaskViewDTO> {
  const access = await projectAccess(actorId, projectId);
  const parsed = savedTaskViewInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  try {
    return await db.transaction(async (tx) => {
      await lockProjectAccess(tx, actorId, projectId, access.project.teamId);
      const [view] = await tx.insert(personalTaskViews).values({ userId: actorId, projectId, ...parsed.data }).returning();
      return toDTO(view);
    });
  } catch (error) { rethrowSaveError(error); }
}

export async function updateMyTaskView(actorId: string, projectId: string, viewId: string, input: SavedTaskViewUpdate): Promise<SavedTaskViewDTO> {
  const access = await projectAccess(actorId, projectId);
  const parsed = savedTaskViewUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  try {
    return await db.transaction(async (tx) => {
      await lockProjectAccess(tx, actorId, projectId, access.project.teamId);
      const current = await ownedView(tx, actorId, projectId, viewId);
      if (current.version !== parsed.data.version) throw new ConflictError("该保存视图已在其他页面更新，请读取最新版本后核对");
      const [view] = await tx.update(personalTaskViews).set({ ...parsed.data, version: current.version + 1, updatedAt: new Date() }).where(eq(personalTaskViews.id, current.id)).returning();
      return toDTO(view);
    });
  } catch (error) { rethrowSaveError(error); }
}

export async function deleteMyTaskView(actorId: string, projectId: string, viewId: string, version: number): Promise<void> {
  const access = await projectAccess(actorId, projectId);
  const parsed = savedTaskViewDeleteSchema.safeParse({ version });
  if (!parsed.success) throw new AppError("保存视图版本无效，请刷新后重试");
  await db.transaction(async (tx) => {
    await lockProjectAccess(tx, actorId, projectId, access.project.teamId);
    const current = await ownedView(tx, actorId, projectId, viewId);
    if (current.version !== version) throw new ConflictError("该保存视图已在其他页面更新，请读取最新版本后再删除");
    await tx.delete(personalTaskViews).where(eq(personalTaskViews.id, current.id));
  });
}

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { projects, projectSpaces, projectSpaceAssignments, tasks, teamMembers, teams } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireTeamRole } from "@/modules/core";
import { projectSpaceMoveError, projectSpaceMutationSchema, type ProjectDirectoryDTO, type ProjectSpaceMutation } from "./space-client";
import { capabilitiesFor } from "./client";
import { requireTeamCapability } from "./permissions";

async function lockDirectory(tx: DbTx, actorId: string, teamId: string) {
  const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  const [member] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)));
  if (!team || !member) throw new ForbiddenError("当前账号不在此团队中");
  await requireTeamCapability(actorId, teamId, "manageProjectDirectory", tx);
}

export async function getProjectDirectory(actorId: string, teamId: string): Promise<ProjectDirectoryDTO> {
  const member = await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  const [spaces, projectRows, counts] = await Promise.all([
    db.select({ id: projectSpaces.id, name: projectSpaces.name, parentId: projectSpaces.parentId, version: projectSpaces.version }).from(projectSpaces).where(eq(projectSpaces.teamId, teamId)).orderBy(asc(projectSpaces.name), asc(projectSpaces.id)),
    db.select({ id: projects.id, name: projects.name, description: projects.description, kind: projects.kind, status: projects.status, spaceId: projectSpaceAssignments.spaceId, placementVersion: projectSpaceAssignments.version }).from(projects).leftJoin(projectSpaceAssignments, eq(projectSpaceAssignments.projectId, projects.id)).where(eq(projects.teamId, teamId)).orderBy(asc(projects.name), asc(projects.id)),
    db.select({ projectId: tasks.projectId, total: sql<number>`count(*)::integer`, accepted: sql<number>`count(*) filter (where ${tasks.status} = 'accepted')::integer` }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(and(eq(projects.teamId, teamId), isNull(tasks.parentTaskId))).groupBy(tasks.projectId),
  ]);
  const byProject = new Map(counts.map((count) => [count.projectId, count]));
  return { canManage: capabilitiesFor(member.positions).manageProjectDirectory, spaces, projects: projectRows.map((project) => ({ ...project, placementVersion: project.placementVersion ?? 0, total: byProject.get(project.id)?.total ?? 0, accepted: byProject.get(project.id)?.accepted ?? 0 })) };
}

export async function mutateProjectDirectory(actorId: string, teamId: string, input: ProjectSpaceMutation): Promise<void> {
  await requireTeamCapability(actorId, teamId, "manageProjectDirectory");
  const parsed = projectSpaceMutationSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const value = parsed.data;
  await db.transaction(async (tx) => {
    await lockDirectory(tx, actorId, teamId);
    const spaces = await tx.select().from(projectSpaces).where(eq(projectSpaces.teamId, teamId));
    if (value.op === "place") {
      const [project] = await tx.select().from(projects).where(and(eq(projects.id, value.projectId), eq(projects.teamId, teamId))).for("update");
      if (!project) throw new NotFoundError("项目不属于当前团队");
      if (value.spaceId && !spaces.some((space) => space.id === value.spaceId)) throw new NotFoundError("目标目录不存在或不属于当前团队");
      const [assignment] = await tx.select().from(projectSpaceAssignments).where(eq(projectSpaceAssignments.projectId, value.projectId)).for("update");
      if ((assignment?.version ?? 0) !== value.version) throw new ConflictError("项目位置已更新，请刷新目录后重试");
      const changes = { spaceId: value.spaceId, version: value.version + 1, updatedAt: new Date() };
      await tx.insert(projectSpaceAssignments).values({ projectId: project.id, ...changes }).onConflictDoUpdate({ target: projectSpaceAssignments.projectId, set: changes });
      return;
    }
    const existing = value.op !== "create" ? spaces.find((space) => space.id === value.id) : undefined;
    if (value.op !== "create" && !existing) throw new NotFoundError("目录不存在或不属于当前团队");
    if (value.op !== "create" && existing!.version !== value.version) throw new ConflictError("目录已更新，请刷新后重试");
    if (value.op === "delete") {
      const [occupied] = await tx.select({ id: projects.id }).from(projectSpaceAssignments).innerJoin(projects, eq(projects.id, projectSpaceAssignments.projectId)).where(eq(projectSpaceAssignments.spaceId, value.id)).limit(1);
      if (spaces.some((space) => space.parentId === value.id) || occupied) throw new ConflictError("目录中还有子目录或项目，请先移出后再删除");
      await tx.delete(projectSpaces).where(eq(projectSpaces.id, value.id));
      return;
    }
    const moveError = projectSpaceMoveError(spaces, existing?.id ?? null, value.parentId);
    if (moveError) throw new ConflictError(moveError);
    if (spaces.some((space) => space.id !== existing?.id && space.parentId === value.parentId && space.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new ConflictError("同一层已存在同名目录，请使用其他名称");
    if (value.op === "create") {
      if (spaces.length >= 200) throw new ConflictError("团队目录已达 200 个，请先整理现有目录");
      await tx.insert(projectSpaces).values({ teamId, name: value.name, parentId: value.parentId });
    } else await tx.update(projectSpaces).set({ name: value.name, parentId: value.parentId, version: value.version + 1, updatedAt: new Date() }).where(and(eq(projectSpaces.id, value.id), eq(projectSpaces.teamId, teamId)));
  });
}

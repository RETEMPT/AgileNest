import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, teamMembers, type TeamRole } from "@/db/schema";
import { ForbiddenError, NotFoundError } from "./errors";

export type ActorRole = TeamRole;

/** 项目访问收敛点：项目不存在或非团队成员一律 null，不泄露存在性。 */
export async function getProjectForUser(actorId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;
  const membership = await getTeamMembership(actorId, project.teamId);
  if (!membership) return null;
  return { project, role: membership.role as ActorRole };
}

export async function requireProjectForUser(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return access;
}

export async function getTeamMembership(userId: string, teamId: string) {
  const [member] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return member ?? null;
}

export async function requireTeamRole(userId: string, teamId: string, allowed: TeamRole[]) {
  const member = await getTeamMembership(userId, teamId);
  if (!member || !allowed.includes(member.role)) throw new ForbiddenError();
  return member;
}

/**
 * 任务写权限：admin + student 可写；teacher 只读（验收走 review 模块的专用动作）。
 * 与 `modules/tasks` 共享同一口径。
 */
const TASK_WRITE_ROLES: TeamRole[] = ["admin", "student"];

export async function requireTaskWrite(actorId: string, projectId: string) {
  const access = await requireProjectForUser(actorId, projectId);
  if (!TASK_WRITE_ROLES.includes(access.role)) throw new ForbiddenError();
  return access;
}

/** 教师验收类动作：teacher + admin。 */
export async function requireReviewer(actorId: string, projectId: string) {
  const access = await requireProjectForUser(actorId, projectId);
  if (access.role !== "teacher" && access.role !== "admin") throw new ForbiddenError();
  return access;
}

export { NotFoundError };

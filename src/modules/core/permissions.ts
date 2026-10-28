import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, teamMembers, memberPositions, type TeamRole } from "@/db/schema";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
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
  return { project, role: membership.role as ActorRole, positions: membership.positions, capabilities: capabilitiesFor(membership.positions, project.kind) };
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
  if (!member) return null;
  const [assignment] = await db.select().from(memberPositions).where(eq(memberPositions.membershipId, member.id));
  return { ...member, positions: assignment?.positions ?? positionsFromRole(member.role) };
}

export async function requireTeamRole(userId: string, teamId: string, allowed: TeamRole[]) {
  const member = await getTeamMembership(userId, teamId);
  if (!member || !allowed.includes(member.role)) throw new ForbiddenError();
  return member;
}

// 可叠加职务按项目场景求并集，学术身份不参与授权。
export async function requireTaskWrite(actorId: string, projectId: string) {
  const access = await requireProjectForUser(actorId, projectId);
  if (!access.capabilities.execute) throw new ForbiddenError();
  return access;
}

/** 指导老师 / 管理员验收类动作。 */
export async function requireReviewer(actorId: string, projectId: string) {
  const access = await requireProjectForUser(actorId, projectId);
  if (!access.capabilities.review) throw new ForbiddenError();
  return access;
}

export { NotFoundError };

import { and, eq } from "drizzle-orm";
import type { DbTx } from "@/db";
import { memberPositions, projects, teamMembers, teams, type TaskAction } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";

export async function lockTeamTaskAccess(tx: DbTx, actorId: string, projectId: string, teamId: string, action: TaskAction) {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new NotFoundError("项目不存在");
  if (project.teamId !== teamId) throw new ConflictError("项目归属已变化，请重新加载");
  const [member] = await tx.select({ role: teamMembers.role, positions: memberPositions.positions })
    .from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)));
  if (!member) throw new ForbiddenError("你已不在该团队中");
  const capabilities = capabilitiesFor(member.positions ?? positionsFromRole(member.role), project.kind);
  if (!capabilities.task.actions.includes(action)) throw new ForbiddenError();
  return { project, role: member.role, capabilities };
}

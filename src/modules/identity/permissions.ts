import { and, eq } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, teamMembers } from "@/db/schema";
import { ForbiddenError } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "./client";

export type TeamCapability = "manageMembers" | "manageTeamInformation" | "manageProjectDirectory" | "manageResources";

export async function requireTeamCapability(actorId: string, teamId: string, capability: TeamCapability, tx: DbTx = db) {
  const [member] = await tx.select({ id: teamMembers.id, role: teamMembers.role, positions: memberPositions.positions })
    .from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)));
  const positions = member && (member.positions ?? positionsFromRole(member.role));
  if (!member || !positions || !capabilitiesFor(positions)[capability]) throw new ForbiddenError("没有权限：当前职务不具备此团队管理能力");
  return { ...member, positions };
}

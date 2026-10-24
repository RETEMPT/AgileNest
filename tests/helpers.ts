import { resetDb } from "./setup";
import { createUser } from "@/lib/user";
import { createProject, createTeam, joinTeam } from "@/modules/identity";

export { resetDb };

export async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

export async function makeTeam(admin: { id: string }, name = "课设组") {
  return createTeam(admin.id, name);
}

export async function makeProject(
  admin: { id: string },
  teamId: string,
  name = "AgileNest",
) {
  return createProject(admin.id, teamId, { name });
}

export async function addMember(
  userId: string,
  inviteCode: string,
) {
  return joinTeam(userId, inviteCode);
}

export async function makeFixture() {
  const admin = await makeUser("admin@agilenest.local");
  const student = await makeUser("student@agilenest.local");
  const teacher = await makeUser("teacher@agilenest.local");
  const outsider = await makeUser("out@agilenest.local");
  const team = await makeTeam(admin);
  await addMember(student.id, team.inviteCode);
  await addMember(teacher.id, team.inviteCode);
  const { db } = await import("@/db");
  const { teamMembers } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");
  await db
    .update(teamMembers)
    .set({ role: "teacher" })
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, teacher.id)));
  const project = await makeProject(admin, team.id);
  return { admin, student, teacher, outsider, team, project };
}

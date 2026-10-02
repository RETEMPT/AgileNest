import { nanoid } from "nanoid";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  teamMembers,
  teams,
  users,
  type TeamRole,
} from "@/db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  isUniqueViolation,
  getProjectForUser,
  getTeamMembership,
  requireTeamRole,
} from "@/modules/core";
import { projectInputSchema, teamNameSchema } from "./schema";

// —— identity：团队 / 成员 / 项目（登录之外的基础域）——

export async function createTeam(userId: string, name: string) {
  const parsed = teamNameSchema.safeParse(name);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name: parsed.data, inviteCode: nanoid(10) })
      .returning();
    await tx
      .insert(teamMembers)
      .values({ teamId: team.id, userId, role: "admin" });
    return team;
  });
}

export async function joinTeam(userId: string, inviteCode: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.inviteCode, inviteCode));
  if (!team) throw new AppError("邀请码无效");

  const [existing] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)),
    );
  if (existing) throw new AppError("已在该团队中");

  try {
    const [member] = await db
      .insert(teamMembers)
      .values({ teamId: team.id, userId, role: "student" })
      .returning();
    return member;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("已在该团队中");
    throw e;
  }
}

export async function listMyTeams(userId: string) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      inviteCode: teams.inviteCode,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId))
    .orderBy(desc(teamMembers.createdAt));
}

export async function listTeamMembers(actorId: string, teamId: string) {
  await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
}

export async function updateMemberRole(
  actorId: string,
  teamId: string,
  targetUserId: string,
  role: TeamRole,
) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .for("update");
    const members = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    if (members.find((member) => member.userId === actorId)?.role !== "admin")
      throw new ForbiddenError();
    const target = members.find((member) => member.userId === targetUserId);
    if (!target) throw new AppError("该成员不在团队中");
    if (
      target.role === "admin" &&
      role !== "admin" &&
      members.filter((member) => member.role === "admin").length === 1
    ) {
      throw new ConflictError("团队至少需要一位管理员，请先指定另一位管理员");
    }
    const [updated] = await tx
      .update(teamMembers)
      .set({ role })
      .where(eq(teamMembers.id, target.id))
      .returning();
    return updated;
  });
}

export async function createProject(
  actorId: string,
  teamId: string,
  input: {
    name: string;
    description?: string;
    kind?: "course" | "lab" | "contest";
    startDate?: string;
    endDate?: string;
  },
) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const [project] = await db
    .insert(projects)
    .values({
      teamId,
      ...parsed.data,
    })
    .returning();
  return project;
}

export async function listTeamProjects(actorId: string, teamId: string) {
  await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  return db
    .select()
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(projects.createdAt));
}

export async function updateProject(
  actorId: string,
  projectId: string,
  patch: {
    name?: string;
    description?: string | null;
    kind?: "course" | "lab" | "contest" | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: "active" | "archived";
  },
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access || access.role !== "admin") throw new ForbiddenError();

  const [updated] = await db
    .update(projects)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && {
        description: patch.description,
      }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.startDate !== undefined && { startDate: patch.startDate }),
      ...(patch.endDate !== undefined && { endDate: patch.endDate }),
      ...(patch.status !== undefined && { status: patch.status }),
    })
    .where(eq(projects.id, projectId))
    .returning();
  if (!updated) throw new AppError("项目不存在");
  return updated;
}

/** 跨团队聚合：我所在全部团队的项目 */
export async function listMyProjects(actorId: string) {
  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, actorId));
  const teamIds = memberships.map((m) => m.teamId);
  if (teamIds.length === 0) return [];

  return db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      kind: projects.kind,
      teamId: projects.teamId,
      teamName: teams.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(teams, eq(projects.teamId, teams.id))
    .where(inArray(projects.teamId, teamIds))
    .orderBy(desc(projects.createdAt));
}

export async function listTeamSpaces(actorId: string) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      inviteCode: teams.inviteCode,
      role: teamMembers.role,
      memberCount:
        sql<number>`(select count(*) from ${teamMembers} m where m.team_id = ${teams.id})`.mapWith(
          Number,
        ),
      projectCount:
        sql<number>`(select count(*) from ${projects} p where p.team_id = ${teams.id} and p.status = 'active')`.mapWith(
          Number,
        ),
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, actorId))
    .orderBy(desc(teamMembers.createdAt));
}

export { getTeamMembership, getProjectForUser, requireTeamRole };

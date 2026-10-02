import { nanoid } from "nanoid";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  teamMembers,
  teams,
  users,
  academicProfiles,
  academicConfirmations,
  memberPositions,
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
import {
  academicProfileSchema,
  positionsSchema,
  projectInputSchema,
  projectUpdateSchema,
  teamNameSchema,
} from "./schema";
import {
  capabilitiesFor,
  positionsFromRole,
  roleFromPositions,
  type AcademicIdentity,
  type TeamPosition,
} from "./client";

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
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      positions: memberPositions.positions,
      profile: {
        identity: academicProfiles.identity,
        institution: academicProfiles.institution,
        department: academicProfiles.department,
        researchFocus: academicProfiles.researchFocus,
        version: academicProfiles.version,
      },
      confirmedVersion: academicConfirmations.profileVersion,
      confirmedAt: academicConfirmations.confirmedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .leftJoin(academicProfiles, eq(academicProfiles.userId, users.id))
    .leftJoin(
      academicConfirmations,
      eq(academicConfirmations.membershipId, teamMembers.id),
    )
    .where(eq(teamMembers.teamId, teamId));
  return rows.map((row) => {
    const positions = row.positions ?? positionsFromRole(row.role);
    return {
      ...row,
      positions,
      canExecute: capabilitiesFor(positions).execute,
      identityConfirmed:
        !!row.profile && row.profile.version === row.confirmedVersion,
    };
  });
}

export async function updateMemberRole(
  actorId: string,
  teamId: string,
  targetUserId: string,
  role: TeamRole,
) {
  return updateMemberPositions(
    actorId,
    teamId,
    targetUserId,
    positionsFromRole(role),
  );
}

export async function updateMemberPositions(
  actorId: string,
  teamId: string,
  targetUserId: string,
  positions: TeamPosition[],
) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  const parsed = positionsSchema.safeParse(positions);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const role = roleFromPositions(parsed.data);
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
    await tx
      .insert(memberPositions)
      .values({
        membershipId: target.id,
        positions: parsed.data,
        updatedById: actorId,
      })
      .onConflictDoUpdate({
        target: memberPositions.membershipId,
        set: {
          positions: parsed.data,
          updatedById: actorId,
          updatedAt: new Date(),
        },
      });
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
  const membership = await requireTeamRole(actorId, teamId, [
    "admin",
    "teacher",
    "student",
  ]);
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  if (!capabilitiesFor(membership.positions, parsed.data.kind).manageProject)
    throw new ForbiddenError("没有权限：只有管理员或该场景的队长可以创建项目");
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
  if (
    !access ||
    !access.capabilities.manageProject ||
    !capabilitiesFor(
      access.positions,
      patch.kind === undefined ? access.project.kind : patch.kind,
    ).manageProject
  )
    throw new ForbiddenError();
  const parsed = projectUpdateSchema.safeParse(patch);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  patch = parsed.data;
  const start =
    patch.startDate === undefined ? access.project.startDate : patch.startDate;
  const end =
    patch.endDate === undefined ? access.project.endDate : patch.endDate;
  if (start && end && start > end)
    throw new AppError("结束日期不能早于开始日期");

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
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      inviteCode: teams.inviteCode,
      role: teamMembers.role,
      positions: memberPositions.positions,
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
    .leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(eq(teamMembers.userId, actorId))
    .orderBy(desc(teamMembers.createdAt));
  return rows.map((row) => ({
    ...row,
    positions: row.positions ?? positionsFromRole(row.role),
  }));
}

export { getTeamMembership, getProjectForUser, requireTeamRole };

export async function getAcademicProfile(actorId: string) {
  const [profile] = await db
    .select()
    .from(academicProfiles)
    .where(eq(academicProfiles.userId, actorId));
  return profile ?? null;
}

export async function saveAcademicProfile(
  actorId: string,
  input: {
    identity: AcademicIdentity;
    institution?: string;
    department?: string;
    researchFocus?: string;
  },
) {
  const parsed = academicProfileSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const [profile] = await db
    .insert(academicProfiles)
    .values({ userId: actorId, ...parsed.data })
    .onConflictDoUpdate({
      target: academicProfiles.userId,
      set: {
        ...parsed.data,
        version: sql`${academicProfiles.version} + 1`,
        updatedAt: new Date(),
      },
      setWhere: sql`${academicProfiles.identity} <> ${parsed.data.identity} or ${academicProfiles.institution} <> ${parsed.data.institution} or ${academicProfiles.department} <> ${parsed.data.department} or ${academicProfiles.researchFocus} <> ${parsed.data.researchFocus}`,
    })
    .returning();
  return profile ?? (await getAcademicProfile(actorId));
}

export async function confirmAcademicIdentity(
  actorId: string,
  teamId: string,
  targetUserId: string,
  version: number,
) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  if (actorId === targetUserId)
    throw new ForbiddenError("自己的身份需由另一位团队管理员确认");
  return db.transaction(async (tx) => {
    // 与职务修改共用团队锁，防止已被撤销的管理员继续确认。
    await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .for("update");
    const memberships = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    if (
      memberships.find((member) => member.userId === actorId)?.role !== "admin"
    )
      throw new ForbiddenError();
    const target = memberships.find((member) => member.userId === targetUserId);
    if (!target) throw new AppError("该成员不在团队中");
    const [profile] = await tx
      .select()
      .from(academicProfiles)
      .where(eq(academicProfiles.userId, targetUserId))
      .for("update");
    if (!profile) throw new AppError("请先让成员填写学术身份");
    if (profile.version !== version)
      throw new ConflictError("成员资料已更新，请刷新后核对新资料");
    const [confirmation] = await tx
      .insert(academicConfirmations)
      .values({
        membershipId: target.id,
        profileVersion: version,
        confirmedById: actorId,
      })
      .onConflictDoUpdate({
        target: academicConfirmations.membershipId,
        set: {
          profileVersion: version,
          confirmedById: actorId,
          confirmedAt: new Date(),
        },
      })
      .returning();
    return confirmation;
  });
}

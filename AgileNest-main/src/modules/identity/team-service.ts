import { nanoid } from "nanoid";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, projects, tasks, teamAnnouncements, teamMembers, teamProfiles, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireTeamRole, todayISO } from "@/modules/core";
import { teamAnnouncementSchema, teamAnnouncementUpdateSchema, teamInformationSchema, teamInviteSchema, teamVersionSchema } from "./team-schema";
import type { TeamAnnouncementDTO, TeamInformationDTO } from "./team-client";
import { canRemoveTeamMember, positionsFromRole } from "./client";
import { requireTeamCapability } from "./permissions";

async function lockTeam(tx: DbTx, actorId: string, teamId: string, manageDaily: boolean) {
  const [team] = await tx.select().from(teams).where(eq(teams.id, teamId)).for("update");
  const members = await tx.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).for("update");
  const actor = members.find((member) => member.userId === actorId);
  if (!team || !actor) throw new ForbiddenError();
  if (manageDaily) await requireTeamCapability(actorId, teamId, "manageTeamInformation", tx);
  return { team, members };
}

async function readTeamInformation(tx: DbTx, teamId: string): Promise<TeamInformationDTO> {
  const [row] = await tx.select({
    id: teams.id, name: teams.name, inviteCode: teams.inviteCode,
    createdAt: teams.createdAt, description: teamProfiles.description,
    website: teamProfiles.website, contactEmail: teamProfiles.contactEmail,
    version: teamProfiles.version, inviteExpiresOn: teamProfiles.inviteExpiresOn, updatedAt: teamProfiles.updatedAt,
  }).from(teams).leftJoin(teamProfiles, eq(teamProfiles.teamId, teams.id)).where(eq(teams.id, teamId));
  if (!row) throw new NotFoundError("团队不存在");
  return {
    id: row.id, name: row.name, inviteCode: row.inviteCode,
    description: row.description ?? "", website: row.website, contactEmail: row.contactEmail,
    version: row.version ?? 1, inviteExpiresOn: row.inviteExpiresOn,
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  };
}

export async function getTeamInformation(actorId: string, teamId: string): Promise<TeamInformationDTO> {
  await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  return readTeamInformation(db, teamId);
}

export async function updateTeamInformation(actorId: string, teamId: string, input: {
  version: number; name: string; description: string; website?: string | null; contactEmail?: string | null;
}): Promise<TeamInformationDTO> {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  const parsed = teamInformationSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId, true);
    const current = await readTeamInformation(tx, teamId);
    if (current.version !== parsed.data.version) throw new ConflictError("团队资料已更新，请重新读取后再保存");
    const { name, version, ...fields } = parsed.data;
    await tx.update(teams).set({ name }).where(eq(teams.id, teamId));
    const changes = { ...fields, version: version + 1, updatedAt: new Date() };
    await tx.insert(teamProfiles).values({ teamId, ...changes }).onConflictDoUpdate({ target: teamProfiles.teamId, set: changes });
    return readTeamInformation(tx, teamId);
  });
}

export async function rotateTeamInvite(actorId: string, teamId: string, input: {
  version: number; inviteExpiresOn?: string | null;
}): Promise<TeamInformationDTO> {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  const parsed = teamInviteSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  if (parsed.data.inviteExpiresOn && parsed.data.inviteExpiresOn < todayISO()) throw new AppError("邀请码有效期不能早于今天");
  return db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId, true);
    const current = await readTeamInformation(tx, teamId);
    if (current.version !== parsed.data.version) throw new ConflictError("团队资料或邀请码已更新，请重新读取后再操作");
    await tx.update(teams).set({ inviteCode: nanoid(10) }).where(eq(teams.id, teamId));
    const changes = { inviteExpiresOn: parsed.data.inviteExpiresOn, version: current.version + 1, updatedAt: new Date() };
    await tx.insert(teamProfiles).values({ teamId, ...changes }).onConflictDoUpdate({ target: teamProfiles.teamId, set: changes });
    return readTeamInformation(tx, teamId);
  });
}

export async function listTeamAnnouncements(actorId: string, teamId: string): Promise<TeamAnnouncementDTO[]> {
  await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  const rows = await db.select({
    id: teamAnnouncements.id, teamId: teamAnnouncements.teamId, title: teamAnnouncements.title,
    body: teamAnnouncements.body, pinned: teamAnnouncements.pinned, version: teamAnnouncements.version,
    authorName: users.name, createdAt: teamAnnouncements.createdAt, updatedAt: teamAnnouncements.updatedAt,
  }).from(teamAnnouncements).leftJoin(users, eq(users.id, teamAnnouncements.authorId))
    .where(eq(teamAnnouncements.teamId, teamId)).orderBy(desc(teamAnnouncements.pinned), desc(teamAnnouncements.updatedAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}

export async function createTeamAnnouncement(actorId: string, teamId: string, input: {
  title: string; body: string; pinned?: boolean;
}) {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  const parsed = teamAnnouncementSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId, true);
    const [announcement] = await tx.insert(teamAnnouncements).values({ teamId, ...parsed.data, authorId: actorId, updatedById: actorId }).returning();
    return announcement;
  });
}

export async function updateTeamAnnouncement(actorId: string, teamId: string, announcementId: string, input: {
  version: number; title: string; body: string; pinned: boolean;
}) {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  const parsed = teamAnnouncementUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId, true);
    const [current] = await tx.select().from(teamAnnouncements).where(and(eq(teamAnnouncements.id, announcementId), eq(teamAnnouncements.teamId, teamId))).for("update");
    if (!current) throw new NotFoundError("公告不存在或已删除");
    if (current.version !== parsed.data.version) throw new ConflictError("公告已更新，请重新读取后再编辑");
    const [updated] = await tx.update(teamAnnouncements).set({
      ...parsed.data, version: current.version + 1, updatedById: actorId, updatedAt: new Date(),
    }).where(eq(teamAnnouncements.id, announcementId)).returning();
    return updated;
  });
}

export async function deleteTeamAnnouncement(actorId: string, teamId: string, announcementId: string, version: number): Promise<void> {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  const parsed = teamVersionSchema.safeParse(version);
  if (!parsed.success) throw new AppError("公告版本无效");
  await db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId, true);
    const [current] = await tx.select().from(teamAnnouncements).where(and(eq(teamAnnouncements.id, announcementId), eq(teamAnnouncements.teamId, teamId))).for("update");
    if (!current) throw new NotFoundError("公告不存在或已删除");
    if (current.version !== parsed.data) throw new ConflictError("公告已更新，请重新读取后再删除");
    await tx.delete(teamAnnouncements).where(eq(teamAnnouncements.id, announcementId));
  });
}

async function removeMembership(actorId: string, teamId: string, targetUserId: string, adminOnly: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const { members } = await lockTeam(tx, actorId, teamId, adminOnly);
    const target = members.find((member) => member.userId === targetUserId);
    if (!target) throw new NotFoundError("该成员已不在团队中");
    if (adminOnly) {
      const actor = await requireTeamCapability(actorId, teamId, "manageTeamInformation", tx);
      const [assignment] = await tx.select().from(memberPositions).where(eq(memberPositions.membershipId, target.id));
      if (!canRemoveTeamMember(actor.positions, assignment?.positions ?? positionsFromRole(target.role))) throw new ForbiddenError("只有管理员可以移除管理员或副管理员");
    }
    if (target.role === "admin" && members.filter((member) => member.role === "admin").length === 1) {
      throw new ConflictError("团队至少需要一位管理员，请先完成管理员交接");
    }
    const [unfinished] = await tx.select({ id: tasks.id }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(projects.teamId, teamId), eq(tasks.assigneeId, targetUserId), ne(tasks.status, "accepted"))).limit(1);
    if (unfinished) throw new ConflictError("该成员仍负责未完成任务，请先转交或退回任务池");
    await tx.delete(teamMembers).where(eq(teamMembers.id, target.id));
  });
}

export async function removeTeamMember(actorId: string, teamId: string, targetUserId: string): Promise<void> {
  await requireTeamCapability(actorId, teamId, "manageTeamInformation");
  if (actorId === targetUserId) throw new AppError("退出自己的团队请使用退出团队入口");
  return removeMembership(actorId, teamId, targetUserId, true);
}

export async function leaveTeam(actorId: string, teamId: string): Promise<void> {
  await requireTeamRole(actorId, teamId, ["admin", "teacher", "student"]);
  return removeMembership(actorId, teamId, actorId, false);
}

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { collaborationNotificationEvents, notificationFollows, notificationPreferences, notifications, projects, resourceTrash, tasks, teamMembers, teamResources, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser, requireTeamRole } from "@/modules/core";
import { DEFAULT_NOTIFICATION_PREFERENCES, followTargetSchema, notificationCategoryFor, type FollowState, type FollowTarget, type NotificationPreferences } from "./client";
import { collaborationNoticeSchema, followUpdateSchema, preferencesUpdateSchema, type CollaborationNoticeInput } from "./schema";

type TargetScope = { teamId: string; projectId: string | null; title: string };
function targetColumns(target: FollowTarget) {
  return { projectId: target.kind === "project" ? target.id : null, taskId: target.kind === "task" ? target.id : null, resourceId: target.kind === "resource" ? target.id : null };
}
function followCondition(target: FollowTarget) {
  return target.kind === "project" ? eq(notificationFollows.projectId, target.id) : target.kind === "task" ? eq(notificationFollows.taskId, target.id) : eq(notificationFollows.resourceId, target.id);
}

async function accessTarget(actorId: string, target: FollowTarget, database: DbTx = db): Promise<TargetScope> {
  if (!followTargetSchema.shape.id.safeParse(actorId).success) throw new ForbiddenError("请先登录后管理协作消息");
  let scope: TargetScope | undefined;
  if (target.kind === "project") {
    const [row] = await database.select({ teamId: projects.teamId, title: projects.name }).from(projects).where(eq(projects.id, target.id));
    if (row) scope = { ...row, projectId: target.id };
  } else if (target.kind === "task") {
    const [row] = await database.select({ teamId: projects.teamId, projectId: tasks.projectId, title: tasks.title }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(eq(tasks.id, target.id));
    scope = row;
  } else {
    const [row] = await database.select({ teamId: teamResources.teamId, projectId: teamResources.projectId, title: teamResources.title }).from(teamResources).leftJoin(resourceTrash, eq(resourceTrash.resourceId, teamResources.id)).where(and(eq(teamResources.id, target.id), isNull(resourceTrash.resourceId)));
    scope = row;
    if (row?.projectId) {
      const [project] = await database.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, row.projectId));
      if (!project || project.teamId !== row.teamId) throw new ForbiddenError("资料不属于当前团队");
    }
  }
  if (!scope) throw new ForbiddenError("无法访问此协作事项");
  if (database === db) {
    if (scope.projectId) await requireProjectForUser(actorId, scope.projectId);
    else await requireTeamRole(actorId, scope.teamId, ["admin", "teacher", "student"]);
  } else {
    const [member] = await database.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.teamId, scope.teamId), eq(teamMembers.userId, actorId)));
    if (!member) throw new ForbiddenError("你已不在此事项所属团队中");
  }
  return scope;
}

async function requireAccount(actorId: string, database: DbTx = db) {
  if (!followTargetSchema.shape.id.safeParse(actorId).success) throw new ForbiddenError("请先登录后管理通知设置");
  const [user] = await database.select({ id: users.id }).from(users).where(eq(users.id, actorId));
  if (!user) throw new NotFoundError("账号不存在，请重新登录");
}

function preferencesDTO(row?: typeof notificationPreferences.$inferSelect): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return { version: row.version, taskUpdates: row.taskUpdates, discussions: row.discussions, mentions: row.mentions, resourceUpdates: row.resourceUpdates, reminders: row.reminders, showBubble: row.showBubble };
}

export async function getNotificationPreferences(actorId: string): Promise<NotificationPreferences> {
  await requireAccount(actorId);
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actorId));
  return preferencesDTO(row);
}

export async function updateNotificationPreferences(actorId: string, input: NotificationPreferences): Promise<NotificationPreferences> {
  await requireAccount(actorId);
  const parsed = preferencesUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId)).for("update");
    const [current] = await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actorId));
    if ((current?.version ?? 0) !== parsed.data.version) throw new ConflictError("通知偏好已在其他页面更新，请重新加载后保存");
    const { version, ...preferences } = parsed.data;
    if (current) {
      const [updated] = await tx.update(notificationPreferences).set({ ...preferences, version: version + 1, updatedAt: new Date() }).where(eq(notificationPreferences.userId, actorId)).returning();
      return preferencesDTO(updated);
    }
    const [created] = await tx.insert(notificationPreferences).values({ userId: actorId, ...preferences, version: 1 }).returning();
    return preferencesDTO(created);
  });
}

export async function getFollowState(actorId: string, target: FollowTarget): Promise<FollowState> {
  const parsed = followTargetSchema.safeParse(target);
  if (!parsed.success) throw new AppError("关注目标无效");
  await accessTarget(actorId, parsed.data);
  const [row] = await db.select().from(notificationFollows).where(and(eq(notificationFollows.userId, actorId), followCondition(parsed.data)));
  return { target: parsed.data, following: row?.active ?? false, version: row?.version ?? 0 };
}

export async function updateFollowState(actorId: string, input: FollowState): Promise<FollowState> {
  const parsed = followUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const access = await accessTarget(actorId, parsed.data.target);
  return db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, access.teamId)).for("update");
    const lockedAccess = await accessTarget(actorId, parsed.data.target, tx);
    if (lockedAccess.teamId !== access.teamId) throw new ConflictError("项目归属已变化，请重新加载");
    const [current] = await tx.select().from(notificationFollows).where(and(eq(notificationFollows.userId, actorId), followCondition(parsed.data.target))).for("update");
    if ((current?.version ?? 0) !== parsed.data.version) throw new ConflictError("关注设置已在其他页面更新，请重新加载");
    const version = parsed.data.version + 1;
    if (current) await tx.update(notificationFollows).set({ active: parsed.data.following, version, updatedAt: new Date() }).where(eq(notificationFollows.id, current.id));
    else await tx.insert(notificationFollows).values({ userId: actorId, ...targetColumns(parsed.data.target), active: parsed.data.following, version });
    return { target: parsed.data.target, following: parsed.data.following, version };
  });
}

export type FollowedItem = { target: FollowTarget; title: string; link: string; version: number };
export async function listMyFollows(actorId: string): Promise<FollowedItem[]> {
  await requireAccount(actorId);
  const rows = await db.select({ follow: notificationFollows, project: projects, task: tasks, resource: { id: teamResources.id, teamId: teamResources.teamId, projectId: teamResources.projectId, title: teamResources.title } })
    .from(notificationFollows).leftJoin(projects, eq(projects.id, notificationFollows.projectId)).leftJoin(tasks, eq(tasks.id, notificationFollows.taskId)).leftJoin(teamResources, eq(teamResources.id, notificationFollows.resourceId)).leftJoin(resourceTrash, eq(resourceTrash.resourceId, notificationFollows.resourceId))
    .where(and(eq(notificationFollows.userId, actorId), eq(notificationFollows.active, true), isNull(resourceTrash.resourceId))).orderBy(desc(notificationFollows.updatedAt)).limit(100);
  const memberships = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, actorId));
  const teamIds = new Set(memberships.map((member) => member.teamId));
  const taskProjectIds = [...new Set(rows.filter((row) => row.task).map((row) => row.task!.projectId))];
  const taskProjects = taskProjectIds.length ? await db.select({ id: projects.id, teamId: projects.teamId }).from(projects).where(inArray(projects.id, taskProjectIds)) : [];
  const projectTeams = new Map(taskProjects.map((project) => [project.id, project.teamId]));
  return rows.flatMap((row): FollowedItem[] => {
    if (row.project && teamIds.has(row.project.teamId)) return [{ target: { kind: "project", id: row.project.id }, title: row.project.name, link: `/p/${row.project.id}`, version: row.follow.version }];
    if (row.task && teamIds.has(projectTeams.get(row.task.projectId) ?? "")) return [{ target: { kind: "task", id: row.task.id }, title: row.task.title, link: `/p/${row.task.projectId}/tasks/${row.task.id}`, version: row.follow.version }];
    if (row.resource?.id && teamIds.has(row.resource.teamId)) return [{ target: { kind: "resource", id: row.resource.id }, title: row.resource.title, link: `${row.resource.projectId ? `/p/${row.resource.projectId}` : `/t/${row.resource.teamId}`}/resources?resource=${row.resource.id}`, version: row.follow.version }];
    return [];
  });
}

export async function eligibleNotificationRecipients(database: DbTx, userIds: string[], type: string): Promise<string[]> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const preferences = await database.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, ids));
  const byUser = new Map(preferences.map((row) => [row.userId, row]));
  const category = notificationCategoryFor(type);
  return ids.filter((id) => (byUser.get(id)?.[category] ?? true));
}

export async function deliverCollaborationNotice(actorId: string, input: CollaborationNoticeInput, database: DbTx, typeOverride?: string): Promise<void> {
  const parsed = collaborationNoticeSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const notice = parsed.data;
  const access = await accessTarget(actorId, notice.target, database);
  await database.select({ id: teams.id }).from(teams).where(eq(teams.id, access.teamId)).for("update");
  const freshAccess = await accessTarget(actorId, notice.target, database);
  if (freshAccess.teamId !== access.teamId) throw new ConflictError("项目归属已变化，请重新加载");
  const members = await database.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, access.teamId));
  const memberIds = new Set(members.map((member) => member.userId));
  const mentioned = new Set(notice.mentionedUserIds ?? []);
  if ([...mentioned].some((id) => !memberIds.has(id))) throw new ForbiddenError("只能提及当前团队中的成员");
  const [event] = await database.insert(collaborationNotificationEvents).values({ actorId, ...targetColumns(notice.target), eventKey: `${notice.target.kind}:${notice.target.id}:${notice.eventKey}` }).onConflictDoNothing().returning({ id: collaborationNotificationEvents.id });
  if (!event) return;
  const watchConditions = [followCondition(notice.target)];
  if (access.projectId && notice.target.kind !== "project") watchConditions.push(eq(notificationFollows.projectId, access.projectId));
  const follows = await database.select().from(notificationFollows).where(or(...watchConditions));
  const cancelled = new Set(follows.filter((row) => !row.active && (notice.target.kind === "project" ? row.projectId === notice.target.id : notice.target.kind === "task" ? row.taskId === notice.target.id : row.resourceId === notice.target.id)).map((row) => row.userId));
  const watchers = new Set(follows.filter((row) => row.active && !cancelled.has(row.userId)).map((row) => row.userId));
  const participants = new Set(notice.participantUserIds ?? []);
  const candidates = [...new Set([...mentioned, ...participants, ...watchers])].filter((id) => id !== actorId && memberIds.has(id));
  if (!candidates.length) return;
  const preferences = await database.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, candidates));
  const byUser = new Map(preferences.map((row) => [row.userId, preferencesDTO(row)]));
  const regularType = typeOverride ?? (notice.event === "discussion" ? "task_discussion" : notice.event);
  const category = notificationCategoryFor(regularType);
  const createdAt = new Date();
  const values = candidates.flatMap((userId) => {
    const preference = byUser.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES;
    const receivesMention = mentioned.has(userId) && preference.mentions;
    const receivesRegular = (participants.has(userId) || watchers.has(userId)) && preference[category];
    if (!receivesMention && !receivesRegular) return [];
    return [{ userId, type: receivesMention ? "collaboration_mention" : regularType, title: notice.title, body: notice.body ?? null, link: notice.link, createdAt }];
  });
  if (values.length) await database.insert(notifications).values(values);
}

export async function enqueueCollaborationNotice(actorId: string, input: CollaborationNoticeInput, tx?: DbTx): Promise<void> {
  if (tx) await deliverCollaborationNotice(actorId, input, tx);
  else await db.transaction((database) => deliverCollaborationNotice(actorId, input, database));
}
export type { CollaborationNoticeInput } from "./schema";

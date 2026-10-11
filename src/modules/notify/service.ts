import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, notifications, projects, taskDiscussionPosts, tasks, teamMembers, teams, users } from "@/db/schema";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core/errors";
import { isDueSoon, isOverdue, todayISO } from "@/modules/core/dates";
import { deliverCollaborationNotice, eligibleNotificationRecipients, getNotificationPreferences } from "./subscriptions";

export type NotificationDTO = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toDTO(row: typeof notifications.$inferSelect): NotificationDTO {
  let body = row.body;
  // 兼容旧版自动通知的固定文案，保留成员填写的成果说明与修改意见。
  if (row.type === "task_assigned" && body === "你被指派/认领了任务，尽快开工") {
    body = "任务已分配给你。";
  }
  if (row.type === "task_accepted" && body === "验收通过，干得漂亮") {
    body = "任务已验收通过。";
  }
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

async function taskContext(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");

  const members = await db
    .select({ userId: teamMembers.userId, role: teamMembers.role, positions: memberPositions.positions, kind: projects.kind })
    .from(teamMembers)
    .innerJoin(projects, eq(projects.teamId, teamMembers.teamId))
    .leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(eq(projects.id, task.projectId));

  const reviewerIds = members
    .filter((m) => capabilitiesFor(m.positions ?? positionsFromRole(m.role), m.kind).review)
    .map((m) => m.userId);

  return {
    task,
    reviewers: reviewerIds,
    memberIds: members.map((member) => member.userId),
    link: `/p/${task.projectId}/tasks/${task.id}`,
  };
}

async function insertFor(
  userIds: string[],
  type: string,
  title: string,
  body: string | null,
  link: string | null,
) {
  const unique = await eligibleNotificationRecipients(db, userIds.filter(Boolean), type);
  if (unique.length === 0) return 0;
  await db
    .insert(notifications)
    .values(unique.map((userId) => ({ userId, type, title: title.slice(0, 200), body: body?.slice(0, 2000) ?? null, link })));
  return unique.length;
}

async function sendTaskNotice(taskId: string, type: string, title: (task: typeof tasks.$inferSelect) => string, body: (task: typeof tasks.$inferSelect) => string, toReviewers: boolean, actorId?: string) {
  const { task, link, memberIds, reviewers } = await taskContext(taskId);
  const recipients = toReviewers ? reviewers : task.assigneeId && memberIds.includes(task.assigneeId) ? [task.assigneeId] : [];
  if (actorId) {
    await db.transaction((tx) => deliverCollaborationNotice(actorId, {
      target: { kind: "task", id: taskId }, event: "task_update", title: title(task).slice(0, 200), body: body(task).slice(0, 2000), link,
      participantUserIds: recipients, eventKey: `${type}:${task.updatedAt.toISOString()}`,
    }, tx, type));
    return;
  }
  await insertFor(recipients, type, title(task), body(task), link);
}

export async function notifyAssigned(taskId: string, actorId?: string): Promise<void> {
  await sendTaskNotice(taskId,
    "task_assigned",
    (task) => `新任务：${task.title}`,
    () => "任务已分配给你。",
    false, actorId,
  );
}

export async function notifySubmitted(taskId: string, actorId?: string): Promise<void> {
  await sendTaskNotice(taskId,
    "task_submitted",
    (task) => `待验收：${task.title}`,
    (task) => task.completionNote ?? "任务已提交，等待验收。",
    true, actorId,
  );
}

export async function notifyAccepted(taskId: string, actorId?: string): Promise<void> {
  await sendTaskNotice(taskId,
    "task_accepted",
    (task) => `已通过：${task.title}`,
    () => "任务已验收通过。",
    false, actorId,
  );
}

export async function notifyRejected(taskId: string, reason: string, actorId?: string): Promise<void> {
  await sendTaskNotice(taskId,
    "task_rejected",
    (task) => `待修改：${task.title}`,
    () => reason || "请按验收意见修改后重新提交",
    false, actorId,
  );
}

export async function notifyTaskDiscussion(actorId: string, taskId: string, postId: string, tx?: DbTx, mentionedUserIds?: string[]): Promise<void> {
  const insert = async (database: DbTx) => {
    const [initial] = await database.select({ teamId: projects.teamId }).from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId)).where(eq(tasks.id, taskId));
    if (!initial) throw new NotFoundError("任务不存在");
    await database.select({ id: teams.id }).from(teams).where(eq(teams.id, initial.teamId)).for("update");
    const [scope] = await database.select({ task: tasks, teamId: projects.teamId }).from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId)).where(eq(tasks.id, taskId));
    if (!scope) throw new NotFoundError("任务不存在");
    if (scope.teamId !== initial.teamId) throw new ConflictError("项目归属已变化，请重新加载");
    const members = await database.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, scope.teamId));
    if (!members.some((member) => member.userId === actorId)) throw new ForbiddenError("你不在此任务所属团队中");
    const [post] = await database.select().from(taskDiscussionPosts)
      .where(and(eq(taskDiscussionPosts.id, postId), eq(taskDiscussionPosts.taskId, taskId)));
    if (!post) throw new NotFoundError("讨论不存在");
    if (post.createdById !== actorId) throw new ForbiddenError("只能发送本人新讨论的通知");
    if (post.withdrawn) throw new ConflictError("讨论已撤回");
    let parentAuthor: string | null = null;
    if (post.parentId) {
      const [parent] = await database.select().from(taskDiscussionPosts)
        .where(and(eq(taskDiscussionPosts.id, post.parentId), eq(taskDiscussionPosts.taskId, taskId)));
      if (!parent || parent.parentId !== null) throw new NotFoundError("原讨论不存在");
      parentAuthor = parent.createdById;
    }
    const type = post.parentId ? "task_discussion_reply" : "task_discussion";
    const link = `/p/${scope.task.projectId}/tasks/${taskId}#discussion-${postId}`;
    const excerpt = post.body.trim().slice(0, 300);
    await deliverCollaborationNotice(actorId, {
      target: { kind: "task", id: taskId }, event: "discussion", link,
      title: `${post.parentId ? "讨论回复" : "任务讨论"}：${scope.task.title}`.slice(0, 200),
      body: excerpt || (post.resources.length ? "新增了讨论附件。" : "新增了任务讨论。"),
      mentionedUserIds, participantUserIds: [scope.task.assigneeId, parentAuthor].filter((id): id is string => Boolean(id)),
      eventKey: `discussion:${postId}`,
    }, database, type);
  };
  if (tx) await insert(tx);
  else await db.transaction(insert);
}

export async function scanAndNotifyDue(): Promise<{
  scanned: number;
  notified: number;
}> {
  const today = todayISO();
  const dayStart = new Date(`${today}T00:00:00`);
  const open = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(eq(tasks.status, "in_progress"));

  const candidates = open.filter(
    (t) =>
      t.assigneeId &&
      t.dueDate &&
      (isOverdue(t.dueDate, today) || isDueSoon(t.dueDate, 3, today)),
  );

  let notified = 0;
  for (const t of candidates) {
    const overdue = isOverdue(t.dueDate!, today);
    const type = overdue ? "task_overdue" : "task_due_soon";
    const link = `/p/${t.projectId}/tasks/${t.id}`;
    const [dup] = await db
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, t.assigneeId!),
          eq(notifications.type, type),
          eq(notifications.link, link),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    if (dup && dup.createdAt >= dayStart) continue;
    const { memberIds } = await taskContext(t.id);
    if (!memberIds.includes(t.assigneeId!)) continue;
    const inserted = await insertFor(
      [t.assigneeId!],
      type,
      overdue ? `已逾期：${t.title}` : `即将到期：${t.title}`,
      `截止 ${t.dueDate}`,
      link,
    );
    notified += inserted;
  }

  return { scanned: candidates.length, notified };
}

export async function listMyNotifications(
  actorId: string,
  opts?: { unreadOnly?: boolean },
): Promise<NotificationDTO[]> {
  const conds = [eq(notifications.userId, actorId)];
  if (opts?.unreadOnly) conds.push(isNull(notifications.readAt));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows.map(toDTO);
}

export async function markRead(actorId: string, id: string): Promise<void> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actorId)))
    .returning();
  if (!updated) throw new NotFoundError("消息不存在");
}

export async function getMyNotificationFeed(actorId: string): Promise<{
  notifications: NotificationDTO[];
  unreadCount: number;
  preferences: { showBubble: boolean };
}> {
  const [rows, totals, preferences] = await Promise.all([
    db.select().from(notifications)
      .where(eq(notifications.userId, actorId))
      .orderBy(desc(notifications.createdAt)).limit(20),
    db.select({ unreadCount: count() }).from(notifications)
      .where(and(eq(notifications.userId, actorId), isNull(notifications.readAt))),
    getNotificationPreferences(actorId),
  ]);
  return { notifications: rows.map(toDTO), unreadCount: totals[0].unreadCount, preferences: { showBubble: preferences.showBubble } };
}

export async function markAllRead(actorId: string): Promise<number> {
  const updated = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actorId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

export async function userDisplayName(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  return u?.name ?? null;
}

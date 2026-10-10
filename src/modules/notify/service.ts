import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { notifications, projects, taskDiscussionPosts, tasks, teamMembers, teams, users } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core/errors";
import { isDueSoon, isOverdue, todayISO } from "@/modules/core/dates";

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
    .select({ userId: teamMembers.userId, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(projects, eq(projects.teamId, teamMembers.teamId))
    .where(eq(projects.id, task.projectId));

  const reviewerIds = members
    .filter((m) => m.role === "teacher" || m.role === "admin")
    .map((m) => m.userId);

  return {
    task,
    reviewers: reviewerIds,
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
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await db
    .insert(notifications)
    .values(unique.map((userId) => ({ userId, type, title, body, link })));
}

export async function notifyAssigned(taskId: string): Promise<void> {
  const { task, link } = await taskContext(taskId);
  if (!task.assigneeId) return;
  await insertFor(
    [task.assigneeId],
    "task_assigned",
    `新任务：${task.title}`,
    "任务已分配给你。",
    link,
  );
}

export async function notifySubmitted(taskId: string): Promise<void> {
  const { task, reviewers, link } = await taskContext(taskId);
  await insertFor(
    reviewers,
    "task_submitted",
    `待验收：${task.title}`,
    task.completionNote ?? "任务已提交，等待验收。",
    link,
  );
}

export async function notifyAccepted(taskId: string): Promise<void> {
  const { task, link } = await taskContext(taskId);
  if (!task.assigneeId) return;
  await insertFor(
    [task.assigneeId],
    "task_accepted",
    `已通过：${task.title}`,
    "任务已验收通过。",
    link,
  );
}

export async function notifyRejected(taskId: string, reason: string): Promise<void> {
  const { task, link } = await taskContext(taskId);
  if (!task.assigneeId) return;
  await insertFor(
    [task.assigneeId],
    "task_rejected",
    `待修改：${task.title}`,
    reason || "请按验收意见修改后重新提交",
    link,
  );
}

export async function notifyTaskDiscussion(actorId: string, taskId: string, postId: string, tx?: DbTx): Promise<void> {
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
    const candidates = new Set([scope.task.assigneeId, parentAuthor].filter((id): id is string => Boolean(id) && id !== actorId));
    const recipients = members.filter((member) => candidates.has(member.userId)).map((member) => member.userId);
    if (!recipients.length) return;
    const type = post.parentId ? "task_discussion_reply" : "task_discussion";
    const link = `/p/${scope.task.projectId}/tasks/${taskId}#discussion-${postId}`;
    const existing = await database.select({ userId: notifications.userId }).from(notifications)
      .where(and(eq(notifications.type, type), eq(notifications.link, link), inArray(notifications.userId, recipients)));
    const sent = new Set(existing.map((item) => item.userId));
    const fresh = recipients.filter((id) => !sent.has(id));
    if (!fresh.length) return;
    const excerpt = post.body.trim().slice(0, 300);
    await database.insert(notifications).values(fresh.map((userId) => ({
      userId, type, link,
      title: `${post.parentId ? "讨论回复" : "任务讨论"}：${scope.task.title}`,
      body: excerpt || (post.resources.length ? "新增了讨论附件。" : "新增了任务讨论。"),
    })));
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
    await insertFor(
      [t.assigneeId!],
      type,
      overdue ? `已逾期：${t.title}` : `即将到期：${t.title}`,
      `截止 ${t.dueDate}`,
      link,
    );
    notified += 1;
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
}> {
  const [rows, totals] = await Promise.all([
    db.select().from(notifications)
      .where(eq(notifications.userId, actorId))
      .orderBy(desc(notifications.createdAt)).limit(20),
    db.select({ unreadCount: count() }).from(notifications)
      .where(and(eq(notifications.userId, actorId), isNull(notifications.readAt))),
  ]);
  return { notifications: rows.map(toDTO), unreadCount: totals[0].unreadCount };
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

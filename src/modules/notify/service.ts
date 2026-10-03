import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, projects, tasks, teamMembers, users } from "@/db/schema";
import { NotFoundError } from "@/modules/core/errors";
import { addDaysISO, isDueSoon, isOverdue, todayISO } from "@/modules/core/dates";

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
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
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
    "你被指派/认领了任务，尽快开工",
    link,
  );
}

export async function notifySubmitted(taskId: string): Promise<void> {
  const { task, reviewers, link } = await taskContext(taskId);
  await insertFor(
    reviewers,
    "task_submitted",
    `待验收：${task.title}`,
    task.completionNote ?? "学生已提交，请验收",
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
    "验收通过，干得漂亮",
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

export async function userDisplayName(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  return u?.name ?? null;
}

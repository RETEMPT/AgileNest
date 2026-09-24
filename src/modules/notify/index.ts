import { NotImplementedError } from "@/modules/core/errors";

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

// —— Owner E（feature-calendar-notify）填实（站内 + 飞书）——

export async function notifyAssigned(taskId: string): Promise<void> {
  void taskId;
  throw new NotImplementedError("notifyAssigned");
}

export async function notifySubmitted(taskId: string): Promise<void> {
  void taskId;
  throw new NotImplementedError("notifySubmitted");
}

export async function notifyAccepted(taskId: string): Promise<void> {
  void taskId;
  throw new NotImplementedError("notifyAccepted");
}

export async function notifyRejected(taskId: string, reason: string): Promise<void> {
  void taskId; void reason;
  throw new NotImplementedError("notifyRejected");
}

/** cron：临期/逾期提醒。由 POST /api/cron/reminders 触发。 */
export async function scanAndNotifyDue(): Promise<{ scanned: number; notified: number }> {
  throw new NotImplementedError("scanAndNotifyDue");
}

export async function listMyNotifications(
  actorId: string,
  opts?: { unreadOnly?: boolean },
): Promise<NotificationDTO[]> {
  void actorId; void opts;
  throw new NotImplementedError("listMyNotifications");
}

export async function markRead(actorId: string, id: string): Promise<void> {
  void actorId; void id;
  throw new NotImplementedError("markRead");
}

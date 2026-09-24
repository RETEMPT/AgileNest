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

// —— Owner E（feature/calendar-notify）填实（站内 + 飞书）——

export async function notifyAssigned(_taskId: string): Promise<void> {
  throw new NotImplementedError("notifyAssigned");
}

export async function notifySubmitted(_taskId: string): Promise<void> {
  throw new NotImplementedError("notifySubmitted");
}

export async function notifyAccepted(_taskId: string): Promise<void> {
  throw new NotImplementedError("notifyAccepted");
}

export async function notifyRejected(_taskId: string, _reason: string): Promise<void> {
  throw new NotImplementedError("notifyRejected");
}

/** cron：临期/逾期提醒，由 POST /api/cron/reminders 触发 */
export async function scanAndNotifyDue(): Promise<{
  scanned: number;
  notified: number;
}> {
  throw new NotImplementedError("scanAndNotifyDue");
}

export async function listMyNotifications(
  _actorId: string,
  _opts?: { unreadOnly?: boolean },
): Promise<NotificationDTO[]> {
  throw new NotImplementedError("listMyNotifications");
}

export async function markRead(_actorId: string, _id: string): Promise<void> {
  throw new NotImplementedError("markRead");
}

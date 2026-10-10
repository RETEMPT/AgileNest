import { z } from "zod";

const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
const feedSchema = z.object({
  notifications: z.array(notificationSchema).max(20),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;
export type NotificationFeed = z.infer<typeof feedSchema>;

export function parseNotificationFeed(value: unknown): NotificationFeed | null {
  const result = feedSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function notificationTarget(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || /[\u0000-\u0020\\]/.test(link)) return null;
  try {
    const url = new URL(link, "https://agilenest.invalid");
    if (url.origin !== "https://agilenest.invalid") return null;
    if (!/^\/(?:p\/|t\/|calendar(?:\/|$)|notifications(?:\/|$))/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function notificationLabel(type: string): string {
  const labels: Record<string, string> = {
    task_assigned: "任务分工",
    task_submitted: "成果待验收",
    task_accepted: "验收通过",
    task_rejected: "需要修改",
    task_due_soon: "即将到期",
    task_overdue: "任务逾期",
    task_discussion: "任务讨论",
    task_discussion_reply: "讨论回复",
  };
  return labels[type] ?? "协作消息";
}

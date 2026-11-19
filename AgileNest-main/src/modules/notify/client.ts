import { z } from "zod";
import { taskEventNote } from "@/modules/tasks/client";

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
  preferences: z.object({ showBubble: z.boolean() }).optional(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;
export type NotificationFeed = z.infer<typeof feedSchema>;

export function notificationDisplayCopy(item: { type: string; title: string; body: string | null }): { title: string; body: string | null } {
  let { title, body } = item;
  if (item.type === "task_assigned" && body === "你被指派/认领了任务，尽快开工") body = "任务已分配给你。";
  if (item.type === "task_accepted" && body === "验收通过，干得漂亮") body = "任务已验收通过。";
  if (item.type === "task_update" && title.endsWith("的依赖已更新")) {
    const updated = taskEventNote("update", body);
    if (updated !== body || body === "任务依赖已更新") {
      title = title.replace(/的依赖已更新$/, "的任务先后已更新");
      body = body === "任务依赖已更新" ? "任务先后已更新" : updated;
    }
  }
  return { title, body };
}

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
    task_update: "任务更新",
    resource_comment: "资料评论",
    resource_update: "资料更新",
    collaboration_mention: "提及了你",
    personal_reminder: "本人日程提醒",
  };
  return labels[type] ?? "协作消息";
}

export function isWorkNotification(type: string): boolean {
  return ["task_assigned", "task_submitted", "task_rejected", "task_accepted", "task_due_soon", "task_overdue", "collaboration_mention", "personal_reminder"].includes(type);
}

export function latestWorkNotifications<T extends { type: string; link: string | null }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((item) => {
    if (!isWorkNotification(item.type)) return false;
    if (!item.link) return true;
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

export const followTargetSchema = z.object({ kind: z.enum(["project", "task", "resource"]), id: z.uuid("关注目标无效") }).strict();
export type FollowTarget = z.infer<typeof followTargetSchema>;
export const followStateSchema = z.object({
  target: followTargetSchema,
  following: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type FollowState = z.infer<typeof followStateSchema>;
export const notificationPreferencesSchema = z.object({
  version: z.number().int().nonnegative(),
  taskUpdates: z.boolean(), discussions: z.boolean(), mentions: z.boolean(),
  resourceUpdates: z.boolean(), reminders: z.boolean(), showBubble: z.boolean(),
}).strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationCategory = "taskUpdates" | "discussions" | "mentions" | "resourceUpdates" | "reminders";
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  version: 0, taskUpdates: true, discussions: true, mentions: true, resourceUpdates: true, reminders: true, showBubble: true,
};

export function parseFollowState(value: unknown): FollowState | null {
  const parsed = followStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseNotificationPreferences(value: unknown): NotificationPreferences | null {
  const parsed = notificationPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function notificationCategoryFor(type: string): NotificationCategory {
  if (type === "collaboration_mention") return "mentions";
  if (["task_discussion", "task_discussion_reply", "resource_comment"].includes(type)) return "discussions";
  if (type === "resource_update") return "resourceUpdates";
  if (["task_due_soon", "task_overdue", "personal_reminder"].includes(type)) return "reminders";
  return "taskUpdates";
}

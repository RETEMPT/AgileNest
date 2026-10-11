import { and, between, eq } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { notificationPreferences, notifications, personalReminderDeliveries, personalScheduleReminders, personalSchedules, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { beijingCalendarDate, reminderMinutesLabel, scheduleReminderInputSchema, scheduleReminderIsDue, scheduleReminderTime, type ScheduleReminderDTO, type ScheduleReminderInput, type ScheduleReminderMinutes } from "./client";
import { scheduleIdSchema } from "./schema";

async function requireAccount(actorId: string, database: DbTx = db) {
  if (!scheduleIdSchema.safeParse(actorId).success) throw new ForbiddenError("请先登录后管理提醒");
  const [account] = await database.select({ id: users.id }).from(users).where(eq(users.id, actorId));
  if (!account) throw new ForbiddenError("账号不可用，请重新登录");
}
async function ownedSchedule(actorId: string, scheduleId: string, database: DbTx = db, lock = false) {
  if (!scheduleIdSchema.safeParse(scheduleId).success) throw new NotFoundError("日程不存在或已删除");
  const query = database.select().from(personalSchedules).where(and(eq(personalSchedules.id, scheduleId), eq(personalSchedules.userId, actorId)));
  const [schedule] = lock ? await query.for("update") : await query;
  if (!schedule) throw new NotFoundError("日程不存在或已删除");
  return schedule;
}
function toReminder(schedule: typeof personalSchedules.$inferSelect, reminder?: typeof personalScheduleReminders.$inferSelect): ScheduleReminderDTO {
  const minutes = (reminder?.minutes ?? 15) as ScheduleReminderMinutes;
  const remindAt = scheduleReminderTime(schedule, minutes);
  if (!remindAt) throw new AppError("日程时间无效，请先编辑日程");
  return { scheduleId: schedule.id, scheduleVersion: schedule.version, reminderVersion: reminder?.version ?? 0, enabled: reminder?.enabled ?? false, minutes, title: schedule.title, scheduleDate: schedule.scheduleDate, startTime: schedule.startTime, remindAt };
}

export async function getMyScheduleReminder(actorId: string, scheduleId: string): Promise<ScheduleReminderDTO> {
  await requireAccount(actorId);
  const schedule = await ownedSchedule(actorId, scheduleId);
  const [reminder] = await db.select().from(personalScheduleReminders).where(eq(personalScheduleReminders.scheduleId, scheduleId));
  return toReminder(schedule, reminder);
}

export async function saveMyScheduleReminder(actorId: string, scheduleId: string, input: ScheduleReminderInput): Promise<ScheduleReminderDTO> {
  await requireAccount(actorId);
  await ownedSchedule(actorId, scheduleId);
  const parsed = scheduleReminderInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    const schedule = await ownedSchedule(actorId, scheduleId, tx, true);
    const [reminder] = await tx.select().from(personalScheduleReminders).where(eq(personalScheduleReminders.scheduleId, scheduleId)).for("update");
    if (schedule.version !== parsed.data.scheduleVersion || (reminder?.version ?? 0) !== parsed.data.reminderVersion) throw new ConflictError("日程或提醒已在其他页面更新，请读取最新版本后核对时间");
    const values = { enabled: parsed.data.enabled, minutes: parsed.data.minutes, version: parsed.data.reminderVersion + 1, updatedAt: new Date() };
    const [updated] = reminder ? await tx.update(personalScheduleReminders).set(values).where(eq(personalScheduleReminders.scheduleId, scheduleId)).returning() : await tx.insert(personalScheduleReminders).values({ scheduleId, ...values }).returning();
    return toReminder(schedule, updated);
  });
}

function shiftISODate(date: string, amount: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + amount * 24 * 60 * 60000).toISOString().slice(0, 10);
}
export async function collectMyScheduleReminders(actorId: string, now = new Date()): Promise<number> {
  await requireAccount(actorId);
  const today = beijingCalendarDate(now);
  if (!today) throw new AppError("提醒检查时间无效");
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId)).for("update");
    const [preference] = await tx.select({ reminders: notificationPreferences.reminders }).from(notificationPreferences).where(eq(notificationPreferences.userId, actorId));
    const rows = await tx.select({ schedule: personalSchedules, reminder: personalScheduleReminders }).from(personalSchedules)
      .innerJoin(personalScheduleReminders, eq(personalScheduleReminders.scheduleId, personalSchedules.id))
      .where(and(eq(personalSchedules.userId, actorId), eq(personalScheduleReminders.enabled, true), between(personalSchedules.scheduleDate, shiftISODate(today, -1), shiftISODate(today, 1))))
      .orderBy(personalSchedules.id).for("update");
    let delivered = 0;
    for (const { schedule, reminder } of rows) {
      const dto = toReminder(schedule, reminder);
      if (!scheduleReminderIsDue(dto.remindAt, now)) continue;
      const [receipt] = await tx.insert(personalReminderDeliveries).values({ scheduleId: schedule.id, scheduleVersion: schedule.version, reminderVersion: reminder.version, deliveredAt: now }).onConflictDoNothing().returning({ id: personalReminderDeliveries.id });
      if (!receipt || preference?.reminders === false) continue;
      const [notification] = await tx.insert(notifications).values({
        userId: actorId, type: "personal_reminder", title: `日程提醒：${schedule.title}`,
        body: `${schedule.scheduleDate} ${schedule.startTime ?? "全天（09:00 提醒）"} · ${reminderMinutesLabel(dto.minutes)}${schedule.description ? `\n${schedule.description}` : ""}`,
        link: `/calendar?y=${Number(schedule.scheduleDate.slice(0, 4))}&m=${Number(schedule.scheduleDate.slice(5, 7))}&date=${schedule.scheduleDate}#schedule-${schedule.id}`,
      }).returning({ id: notifications.id });
      await tx.update(personalReminderDeliveries).set({ notificationId: notification.id }).where(eq(personalReminderDeliveries.id, receipt.id));
      delivered += 1;
    }
    return delivered;
  });
}

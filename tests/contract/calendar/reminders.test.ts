import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, notifications, personalReminderDeliveries } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { collectMyScheduleReminders, createSchedule, deleteSchedule, getMyScheduleReminder, saveMyScheduleReminder, scheduleReminderGET, scheduleReminderPUT, updateSchedule } from "@/modules/calendar";
import { requireApiUser } from "@/lib/api";
import { makeFixture, makeUser, resetDb } from "../../helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => { const actual = await importOriginal<typeof import("@/lib/api")>(); return { ...actual, requireApiUser: vi.fn() }; });
const input = { title: "本人资料整理", scheduleDate: "2026-10-11", startTime: "09:00", endTime: "10:00" };
const due = new Date("2026-10-11T00:45:00Z");
async function enable(userId: string, scheduleId: string) {
  const reminder = await getMyScheduleReminder(userId, scheduleId);
  return saveMyScheduleReminder(userId, scheduleId, { scheduleVersion: reminder.scheduleVersion, reminderVersion: reminder.reminderVersion, enabled: true, minutes: 15 });
}
beforeEach(async () => { vi.clearAllMocks(); await resetDb(); });

describe("calendar 本人提醒服务", () => {
  it("初始关闭，本人可保存提前量并读取双版本", async () => {
    const user = await makeUser("reminder@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    expect(await getMyScheduleReminder(user.id, schedule.id)).toMatchObject({ enabled: false, reminderVersion: 0, scheduleVersion: 1 });
    const saved = await enable(user.id, schedule.id);
    expect(saved).toMatchObject({ enabled: true, minutes: 15, reminderVersion: 1, remindAt: due.toISOString() });
    expect(await getMyScheduleReminder(user.id, schedule.id)).toEqual(saved);
  });
  it("同团队管理员不能读取或修改成员提醒，也不能收集他人的日程", async () => {
    const fx = await makeFixture();
    const schedule = await createSchedule(fx.student.id, input);
    await enable(fx.student.id, schedule.id);
    await expect(getMyScheduleReminder(fx.admin.id, schedule.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveMyScheduleReminder(fx.admin.id, schedule.id, { scheduleVersion: 1, reminderVersion: 1, enabled: false, minutes: 15 })).rejects.toBeInstanceOf(NotFoundError);
    expect(await collectMyScheduleReminders(fx.admin.id, due)).toBe(0);
    expect(await collectMyScheduleReminders(fx.student.id, due)).toBe(1);
    const messages = await db.select().from(notifications);
    expect(messages).toHaveLength(1);
    expect(messages[0].userId).toBe(fx.student.id);
    expect(messages[0].createdAt.getTime()).toBe(due.getTime());
  });
  it("旧日程版本或旧提醒版本返回409，并发设置只有一次成功", async () => {
    const user = await makeUser("reminder-version@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    const data = { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 15 as const };
    const results = await Promise.allSettled([saveMyScheduleReminder(user.id, schedule.id, data), saveMyScheduleReminder(user.id, schedule.id, { ...data, minutes: 30 })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
    await updateSchedule(user.id, schedule.id, 1, { ...input, startTime: "10:00", endTime: "11:00" });
    await expect(saveMyScheduleReminder(user.id, schedule.id, { ...data, reminderVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
    expect((await getMyScheduleReminder(user.id, schedule.id)).scheduleVersion).toBe(2);
  });
  it("未来不发，到期与并发检查只产生一条消息", async () => {
    const user = await makeUser("reminder-due@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    await enable(user.id, schedule.id);
    expect(await collectMyScheduleReminders(user.id, new Date(due.getTime() - 1))).toBe(0);
    const results = await Promise.all([collectMyScheduleReminders(user.id, due), collectMyScheduleReminders(user.id, due)]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await collectMyScheduleReminders(user.id, due)).toBe(0);
    const [message] = await db.select().from(notifications);
    expect(message.type).toBe("personal_reminder");
    expect(message.link).toContain(`#schedule-${schedule.id}`);
    expect(await db.select().from(personalReminderDeliveries)).toHaveLength(1);
  });
  it("关闭提醒偏好不生成消息，事后开启不回放同一版本", async () => {
    const user = await makeUser("reminder-off@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    await enable(user.id, schedule.id);
    await db.insert(notificationPreferences).values({ userId: user.id, reminders: false });
    expect(await collectMyScheduleReminders(user.id, due)).toBe(0);
    expect(await db.select().from(notifications)).toEqual([]);
    expect((await db.select().from(personalReminderDeliveries))[0].notificationId).toBeNull();
    await db.update(notificationPreferences).set({ reminders: true }).where(eq(notificationPreferences.userId, user.id));
    expect(await collectMyScheduleReminders(user.id, due)).toBe(0);
    expect(await db.select().from(notifications)).toEqual([]);
  });
  it("更新时间后只按新日程版本计算，旧提醒时刻不再触发", async () => {
    const user = await makeUser("reminder-move@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    await enable(user.id, schedule.id);
    await updateSchedule(user.id, schedule.id, 1, { ...input, scheduleDate: "2026-10-12" });
    expect(await collectMyScheduleReminders(user.id, due)).toBe(0);
    expect(await collectMyScheduleReminders(user.id, new Date("2026-10-12T00:45:00Z"))).toBe(1);
    expect((await db.select().from(personalReminderDeliveries))[0].scheduleVersion).toBe(2);
  });
  it("全天按09:00提醒，24小时外不追补；删除日程清理关联记录", async () => {
    const user = await makeUser("reminder-expire@agilenest.local");
    const schedule = await createSchedule(user.id, { ...input, startTime: null, endTime: null });
    const initial = await getMyScheduleReminder(user.id, schedule.id);
    await saveMyScheduleReminder(user.id, schedule.id, { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 0 });
    expect(initial.startTime).toBeNull();
    expect(await collectMyScheduleReminders(user.id, new Date("2026-10-12T01:00:01Z"))).toBe(0);
    expect(await collectMyScheduleReminders(user.id, new Date("2026-10-11T01:00:00Z"))).toBe(1);
    await deleteSchedule(user.id, schedule.id, 1);
    expect(await db.select().from(personalReminderDeliveries)).toEqual([]);
    await expect(getMyScheduleReminder(user.id, schedule.id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("不存在账号、非法设置和无效检查时间被拒绝", async () => {
    await expect(collectMyScheduleReminders("00000000-0000-4000-8000-000000000000", due)).rejects.toBeInstanceOf(ForbiddenError);
    const user = await makeUser("reminder-invalid@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    await expect(saveMyScheduleReminder(user.id, schedule.id, { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 7 as 15 })).rejects.toBeInstanceOf(AppError);
    await expect(collectMyScheduleReminders(user.id, new Date("invalid"))).rejects.toBeInstanceOf(AppError);
  });
});

describe("本人提醒 HTTP 边界", () => {
  const endpoint = "http://localhost/api/v1/calendar/schedules/reminder";
  const ctx = (scheduleId: string) => ({ params: Promise.resolve({ scheduleId }) });
  const put = (body: unknown) => new Request(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("未登录返回401，响应禁缓存", async () => {
    vi.mocked(requireApiUser).mockRejectedValue(new AppError("未登录", 401));
    for (const response of [await scheduleReminderGET(new Request(endpoint), ctx("00000000-0000-4000-8000-000000000000")), await scheduleReminderPUT(put({}), ctx("00000000-0000-4000-8000-000000000000"))]) {
      expect(response.status).toBe(401); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
  it("本人保存成功，旧版本返回409且他人读取返回404", async () => {
    const user = await makeUser("reminder-api@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    vi.mocked(requireApiUser).mockResolvedValue(user);
    const data = { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 15 };
    const response = await scheduleReminderPUT(put(data), ctx(schedule.id));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).reminderVersion).toBe(1);
    expect((await scheduleReminderPUT(put(data), ctx(schedule.id))).status).toBe(409);
    const other = await makeUser("reminder-api-other@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(other);
    expect((await scheduleReminderGET(new Request(endpoint), ctx(schedule.id))).status).toBe(404);
  });
  it("不接受用户归属覆写、过大请求或非法JSON", async () => {
    const user = await makeUser("reminder-api-size@agilenest.local");
    const schedule = await createSchedule(user.id, input);
    vi.mocked(requireApiUser).mockResolvedValue(user);
    const data = { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 15 };
    expect((await scheduleReminderPUT(put({ ...data, userId: user.id }), ctx(schedule.id))).status).toBe(400);
    expect((await scheduleReminderPUT(put({ ...data, body: "字".repeat(3000) }), ctx(schedule.id))).status).toBe(400);
    expect((await scheduleReminderPUT(new Request(endpoint, { method: "PUT", body: "{" }), ctx(schedule.id))).status).toBe(400);
  });
});

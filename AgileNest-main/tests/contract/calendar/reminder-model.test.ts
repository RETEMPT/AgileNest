import { describe, expect, it } from "vitest";
import { beijingCalendarDate, parseScheduleReminder, reminderMinutesLabel, scheduleReminderInputSchema, scheduleReminderIsDue, scheduleReminderTime } from "@/modules/calendar/client";

describe("本人提醒时间与版本契约", () => {
  const schedule = { scheduleDate: "2026-10-11", startTime: "09:00" };
  it("同日时间始终用北京时间换算，不依赖主机时区", () => {
    expect(scheduleReminderTime(schedule, 15)).toBe("2026-10-11T00:45:00.000Z");
  });
  it("全天日程采用北京时间09:00，提前一天跨日期正确", () => {
    expect(scheduleReminderTime({ ...schedule, startTime: null }, 1440)).toBe("2026-10-10T01:00:00.000Z");
  });
  it("提醒只在到点后的24小时内补发，未来和更早的均排除", () => {
    const at = "2026-10-11T00:45:00.000Z";
    expect(scheduleReminderIsDue(at, new Date("2026-10-11T00:44:59Z"))).toBe(false);
    expect(scheduleReminderIsDue(at, new Date(at))).toBe(true);
    expect(scheduleReminderIsDue(at, new Date("2026-10-12T00:45:00Z"))).toBe(true);
    expect(scheduleReminderIsDue(at, new Date("2026-10-12T00:45:01Z"))).toBe(false);
  });
  it("北京时间日期在UTC当天16时切换，跨年正确", () => {
    expect(beijingCalendarDate(new Date("2026-12-31T15:59:59Z"))).toBe("2026-12-31");
    expect(beijingCalendarDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });
  it("拒绝非法日期、24:00时间和未支持的提前量", () => {
    expect(scheduleReminderTime({ ...schedule, scheduleDate: "2026-02-30" }, 15)).toBeNull();
    expect(scheduleReminderTime({ ...schedule, startTime: "24:00" }, 15)).toBeNull();
    expect(scheduleReminderTime(schedule, 7)).toBeNull();
    expect(beijingCalendarDate(new Date("invalid"))).toBeNull();
  });
  it("保存必须带两个有效版本，不接受他人账号或字符串开关", () => {
    const input = { scheduleVersion: 1, reminderVersion: 0, enabled: true, minutes: 15 };
    expect(scheduleReminderInputSchema.safeParse(input).success).toBe(true);
    expect(scheduleReminderInputSchema.safeParse({ ...input, scheduleVersion: 0 }).success).toBe(false);
    expect(scheduleReminderInputSchema.safeParse({ ...input, reminderVersion: -1 }).success).toBe(false);
    expect(scheduleReminderInputSchema.safeParse({ ...input, enabled: "true" }).success).toBe(false);
    expect(scheduleReminderInputSchema.safeParse({ ...input, userId: "other" }).success).toBe(false);
  });
  it("本人提醒响应保留双版本与实际时间，标签符合提前量", () => {
    const dto = { scheduleId: "38b626fa-e050-48cd-9848-9f6ea252ea48", scheduleVersion: 2, reminderVersion: 1, enabled: true, minutes: 15, title: "本人讨论", ...schedule, remindAt: "2026-10-11T00:45:00.000Z" };
    expect(parseScheduleReminder(dto)?.scheduleVersion).toBe(2);
    expect(reminderMinutesLabel(0)).toBe("开始时");
    expect(reminderMinutesLabel(1440)).toBe("提前 1 天");
  });
});

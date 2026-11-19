import { beforeEach, describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/modules/core";
import {
  createSchedule,
  deleteSchedule,
  listMySchedules,
  monthView,
  updateSchedule,
} from "@/modules/calendar";
import {
  calendarUrl,
  parseCalendarQuery,
  scheduleInputSchema,
  selectSchedules,
} from "@/modules/calendar/client";
import { createTask } from "@/modules/tasks";
import { db } from "@/db";
import { personalSchedules } from "@/db/schema";
import { makeFixture, makeUser, resetDb } from "../../helpers";

const input = {
  title: "课题讨论",
  description: "准备研究进展",
  scheduleDate: "2026-10-05",
  startTime: "09:00",
  endTime: "10:00",
  priority: 1 as const,
};
beforeEach(resetDb);

describe("calendar 个人日程服务", () => {
  it("保存、按月读取、编辑与删除，持久化日期和时间", async () => {
    const user = await makeUser("calendar@agilenest.local");
    const created = await createSchedule(user.id, {
      ...input,
      title: "  课题讨论  ",
    });
    expect(created.title).toBe("课题讨论");
    expect(created.version).toBe(1);
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([created]);
    const updated = await updateSchedule(user.id, created.id, 1, {
      ...input,
      priority: 2,
      description: "准备演示",
    });
    expect(updated.version).toBe(2);
    expect(updated.priority).toBe(2);
    await deleteSchedule(user.id, updated.id, 2);
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([]);
  });

  it("不在任何团队的账号也可管理自己的全天安排", async () => {
    const user = await makeUser("solo@agilenest.local");
    const created = await createSchedule(user.id, {
      title: "资料整理",
      scheduleDate: "2026-10-05",
    });
    expect(created.startTime).toBeNull();
    expect(created.endTime).toBeNull();
    expect(created.priority).toBe(0);
  });

  it("同团队管理员不能读取、修改或删除成员的个人安排", async () => {
    const { admin, student } = await makeFixture();
    const item = await createSchedule(student.id, input);
    expect(await listMySchedules(admin.id, 2026, 10)).toEqual([]);
    await expect(
      updateSchedule(admin.id, item.id, 1, input),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSchedule(admin.id, item.id, 1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await listMySchedules(student.id, 2026, 10)).toEqual([item]);
  });

  it("不存在的账号无法查询或创建日程", async () => {
    const actor = "00000000-0000-4000-8000-000000000000";
    await expect(listMySchedules(actor, 2026, 10)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createSchedule(actor, input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it.each([
    { startTime: "11:00", endTime: "10:00" },
    { startTime: "09:00", endTime: null },
    { priority: 3 as 0 | 1 | 2 },
  ])("数据库约束拒绝绕过服务的非法记录：%j", async (change) => {
    const user = await makeUser("constraint@agilenest.local");
    await expect(db.insert(personalSchedules).values({ ...input, ...change, userId: user.id })).rejects.toThrow();
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([]);
  });

  it.each([
    { scheduleDate: "2026-02-29" },
    { startTime: "10:00", endTime: "09:00" },
    { startTime: "09:00", endTime: "09:00" },
    { startTime: "24:00" },
    { startTime: null, endTime: "10:00" },
    { title: "   " },
    { description: "a".repeat(501) },
  ])("非法日期、时间或长度被拒绝且不写入：%j", async (change) => {
    const user = await makeUser("invalid@agilenest.local");
    await expect(
      createSchedule(user.id, { ...input, ...change }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([]);
  });

  it("拒绝伪造归属与版本字段", async () => {
    const user = await makeUser("owner@agilenest.local");
    await expect(
      createSchedule(user.id, {
        ...input,
        userId: "other",
        version: 99,
      } as typeof input),
    ).rejects.toBeInstanceOf(AppError);
    expect(
      scheduleInputSchema.safeParse({ ...input, priority: 3 }).success,
    ).toBe(false);
  });

  it("旧页面编辑或删除返回 409，不覆盖已保存的内容", async () => {
    const user = await makeUser("version@agilenest.local");
    const item = await createSchedule(user.id, input);
    await updateSchedule(user.id, item.id, 1, {
      ...input,
      title: "已确认讨论时间",
    });
    await expect(
      updateSchedule(user.id, item.id, 1, input),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteSchedule(user.id, item.id, 1)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await listMySchedules(user.id, 2026, 10))[0].title).toBe(
      "已确认讨论时间",
    );
  });

  it("同版本并发编辑只有一个成功", async () => {
    const user = await makeUser("race@agilenest.local");
    const item = await createSchedule(user.id, input);
    const results = await Promise.allSettled([
      updateSchedule(user.id, item.id, 1, { ...input, title: "安排 A" }),
      updateSchedule(user.id, item.id, 1, { ...input, title: "安排 B" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toBeInstanceOf(
      ConflictError,
    );
    expect((await listMySchedules(user.id, 2026, 10))[0].version).toBe(2);
  });

  it("月范围与闰年边界精确，不包含相邻月安排", async () => {
    const user = await makeUser("range@agilenest.local");
    await createSchedule(user.id, { ...input, scheduleDate: "2024-02-29" });
    await createSchedule(user.id, { ...input, scheduleDate: "2024-03-01" });
    expect(
      (await listMySchedules(user.id, 2024, 2)).map(
        (item) => item.scheduleDate,
      ),
    ).toEqual(["2024-02-29"]);
    await expect(listMySchedules(user.id, 2026, 13)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(listMySchedules(user.id, 2026.5, 10)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("项目日历保留任务截止、42 格与项目 ACL，个人安排不混入", async () => {
    const { admin, outsider, project } = await makeFixture();
    await createTask(admin.id, project.id, {
      title: "项目任务",
      dueDate: "2026-10-05",
    });
    await createSchedule(admin.id, input);
    const cells = await monthView(admin.id, project.id, 2026, 10);
    expect(cells).toHaveLength(42);
    expect(
      cells
        .find((cell) => cell.iso === "2026-10-05")
        ?.tasks.map((task) => task.title),
    ).toEqual(["项目任务"]);
    await expect(
      monthView(outsider.id, project.id, 2026, 10),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      monthView(admin.id, project.id, 2026, 0),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("已删除日程与非法 ID 返回 404", async () => {
    const user = await makeUser("removed@agilenest.local");
    const item = await createSchedule(user.id, input);
    await deleteSchedule(user.id, item.id, 1);
    await expect(
      updateSchedule(user.id, item.id, 1, input),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSchedule(user.id, "wrong", 1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("calendar 查询与搜索", () => {
  it("URL 保留日期、搜索和优先级，非法月份或日期安全回到当前范围", () => {
    const query = parseCalendarQuery(
      { y: "2026", m: "11", date: "2026-10-05", q: "  讨论 ", priority: "2" },
      "2026-10-05",
    );
    expect(query).toEqual({
      year: 2026,
      month: 11,
      date: "2026-11-01",
      q: "讨论",
      priority: 2,
    });
    const url = new URL(calendarUrl(query), "http://localhost");
    expect(
      parseCalendarQuery(Object.fromEntries(url.searchParams), "2026-10-05"),
    ).toEqual(query);
    expect(
      parseCalendarQuery(
        { y: "9999", m: "13", date: "2026-02-30" },
        "2026-10-05",
      ).date,
    ).toBe("2026-10-05");
    expect(
      parseCalendarQuery(
        { q: ["讨论", "其它"], priority: ["2", "1"] },
        "2026-10-05",
      ),
    ).toMatchObject({ q: "讨论", priority: 2 });
  });

  it("搜索匹配标题/说明，按时间排序且不修改原数组", async () => {
    const user = await makeUser("search@agilenest.local");
    const late = await createSchedule(user.id, {
      ...input,
      title: "下午会议",
      description: "课题讨论",
      startTime: "14:00",
      endTime: "15:00",
      priority: 2,
    });
    const early = await createSchedule(user.id, input);
    const items = [late, early];
    expect(
      selectSchedules(items, { q: "讨论", priority: null }).map(
        (item) => item.id,
      ),
    ).toEqual([early.id, late.id]);
    expect(selectSchedules(items, { q: "讨论", priority: 2 })).toEqual([late]);
    expect(items).toEqual([late, early]);
  });
});

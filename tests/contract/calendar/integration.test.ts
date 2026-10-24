import { beforeEach, describe, expect, it } from "vitest";
import { addMilestoneRow, addTask, makeFixture, makeUser, resetDb } from "./fixtures";
import { calendarBoard, listAgenda, monthView, parseCalendarQuery } from "@/modules/calendar";
import { calendarRange, taskEventsForDate } from "@/modules/calendar/client";
import { AppError, ForbiddenError } from "@/modules/core";

describe("日历分支集成", () => {
  beforeEach(resetDb);

  it("历史月份的日程取所选月份，不从今天开始截掉", async () => {
    const { admin, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "二月安排", dueDate: "2026-02-10" });
    const board = await calendarBoard(admin.id, project.id, { year: 2026, month: 2, range: { from: "2026-02-01", to: "2026-02-28" } });
    expect(board.days.map((day) => day.iso)).toEqual(["2026-02-10"]);
    expect(board.days[0].items[0].title).toBe("二月安排");
  });

  it("月网格与日程共享状态筛选，任务筛选不混入里程碑", async () => {
    const { admin, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "进行中", dueDate: "2026-10-05", status: "in_progress" });
    await addTask({ projectId: project.id, title: "已完成", dueDate: "2026-10-05", status: "accepted" });
    await addMilestoneRow({ projectId: project.id, title: "节点", targetDate: "2026-10-05" });
    const board = await calendarBoard(admin.id, project.id, { year: 2026, month: 10, range: { from: "2026-10-01", to: "2026-10-31" }, filters: { status: ["in_progress"] } });
    expect(board.cells.flatMap((cell) => cell.events.map((event) => event.title))).toEqual(["进行中"]);
    expect(board.days.flatMap((day) => day.items.map((event) => event.title))).toEqual(["进行中"]);
  });

  it("旧月视图任务/里程碑数组与新事件形状均保留", async () => {
    const { admin, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "兼容任务", dueDate: "2026-10-05" });
    await addMilestoneRow({ projectId: project.id, title: "兼容节点", targetDate: "2026-10-05" });
    const cell = (await monthView(admin.id, project.id, 2026, 10)).find((item) => item.iso === "2026-10-05")!;
    expect(cell.tasks.map((task) => task.title)).toEqual(["兼容任务"]);
    expect(cell.milestones.map((milestone) => milestone.title)).toEqual(["兼容节点"]);
    expect(cell.events.map((event) => event.title).sort()).toEqual(["兼容任务", "兼容节点"].sort());
  });

  it("非法日期与窗口在服务边界被拒绝", async () => {
    const { admin, project } = await makeFixture();
    await expect(listAgenda(admin.id, project.id, { from: "2026-02-30", to: "2026-03-01" })).rejects.toBeInstanceOf(AppError);
    await expect(calendarBoard(admin.id, project.id, { year: 2026, month: 10, horizonDays: 10000 })).rejects.toBeInstanceOf(AppError);
    await expect(calendarBoard(admin.id, project.id, { year: 99999, month: 10 })).rejects.toBeInstanceOf(AppError);
  });

  it("集成日程查询不扩大项目权限", async () => {
    const { project } = await makeFixture();
    const outsider = await makeUser("calendar-release-outsider@agilecampus.local");
    await expect(calendarBoard(outsider.id, project.id, { year: 2026, month: 10 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("长跨度任务按可见窗口裁剪，事件仍保留完整跨度", () => {
    const task = { id: "long-task", title: "长期课题", startDate: "1900-01-01", dueDate: "2100-12-31", status: "in_progress" as const };
    expect(calendarRange(task, "2026-10-05", "2026-10-06")).toEqual(["2026-10-05", "2026-10-06"]);
    expect(taskEventsForDate(task, "2026-10-05")).toMatchObject({ date: "2026-10-05", endsToday: false });
    expect(taskEventsForDate(task, "2026-10-05")!.spanDays).toBeGreaterThan(70000);
    expect(parseCalendarQuery(new URLSearchParams("year=999999&month=13"), "2026-10-06")).toMatchObject({ year: 2026, month: 1 });
  });
});

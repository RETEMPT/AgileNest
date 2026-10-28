import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarRange,
  compareEvents,
  currentYearMonth,
  eventIsAtRisk,
  eventIsDone,
  eventIsOverdue,
  groupByDay,
  isWeekendISO,
  isValidYearMonth,
  milestoneToEvent,
  monthBounds,
  monthGridRange,
  monthKey,
  shapeEvents,
  shiftMonth,
  taskDates,
  taskEventsForDate,
  weekdayLabel,
  WEEKDAY_LABELS,
  type CalendarEvent,
} from "@/modules/calendar/client";
import { parseCalendarQuery, serializeCalendarQuery } from "@/modules/calendar";
import { todayISO } from "@/modules/core/dates";
import type { MilestoneDTO } from "@/modules/milestone";

const milestoneDTO = (targetDate: string | null): MilestoneDTO => ({
  id: "m1",
  projectId: "p1",
  title: "中期检查",
  description: null,
  kind: "midterm",
  targetDate,
  status: "open",
  createdAt: new Date("2026-01-01T00:00:00Z"),
});

const taskEvent = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "t1",
  kind: "task",
  title: "写中期报告",
  startDate: "2026-10-05",
  dueDate: "2026-10-07",
  taskStatus: "in_progress",
  milestoneKind: null,
  assigneeId: null,
  assigneeName: null,
  priority: "medium",
  milestoneId: null,
  date: "2026-10-05",
  spanDays: 3,
  endsToday: false,
  ...over,
});

describe("taskDates：起止区间展开", () => {
  it("闭区间展开成每一天", () => {
    expect(taskDates({ startDate: "2026-10-05", dueDate: "2026-10-07" })).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("只有一端时退化成单日", () => {
    expect(taskDates({ startDate: "2026-10-05", dueDate: null })).toEqual(["2026-10-05"]);
    expect(taskDates({ startDate: null, dueDate: "2026-10-09" })).toEqual(["2026-10-09"]);
  });

  it("两个日期都没有 → 不上日历", () => {
    expect(taskDates({ startDate: null, dueDate: null })).toEqual([]);
  });

  it("起止写反时按截止日兜底，不产生空数组", () => {
    expect(taskDates({ startDate: "2026-10-09", dueDate: "2026-10-05" })).toEqual([
      "2026-10-05",
    ]);
  });

  it("跨月展开连续", () => {
    expect(taskDates({ startDate: "2026-10-31", dueDate: "2026-11-02" })).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});

describe("calendarRange：窗口裁剪", () => {
  const task = { startDate: "2026-10-01", dueDate: "2026-10-10" };

  it("只保留闭区间内的日期", () => {
    expect(calendarRange(task, "2026-10-03", "2026-10-05")).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("完全在窗口外 → 空", () => {
    expect(calendarRange(task, "2026-11-01", "2026-11-30")).toEqual([]);
  });
});

describe("月网格与月份导航", () => {
  it("42 格，周一起始，覆盖前后补齐", () => {
    const cells = monthGridRange(2026, 10);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe("2026-09-28");
    expect(cells[41]).toBe("2026-11-08");
  });

  it("shiftMonth 跨年进位/借位", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
  });

  it("currentYearMonth / monthKey / monthBounds", () => {
    expect(currentYearMonth("2026-10-04")).toEqual({ year: 2026, month: 10 });
    expect(monthKey(2026, 10)).toBe("2026-10");
    expect(monthBounds(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("weekdayLabel / isWeekendISO 以周一为一周起点", () => {
    expect(WEEKDAY_LABELS[0]).toBe("周一");
    expect(weekdayLabel("2026-10-05")).toBe("周一");
    expect(weekdayLabel("2026-10-11")).toBe("周日");
    expect(isWeekendISO("2026-10-10")).toBe(true);
    expect(isWeekendISO("2026-10-09")).toBe(false);
  });

  it("isValidYearMonth 拒非法年月", () => {
    expect(isValidYearMonth(2026, 10)).toBe(true);
    expect(isValidYearMonth(2026, 13)).toBe(false);
    expect(isValidYearMonth(2026, 0)).toBe(false);
    expect(isValidYearMonth(2026, 1.5)).toBe(false);
  });

  it("addDays 跨月", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("事件模型", () => {
  it("里程碑两端都取目标日期", () => {
    expect(milestoneToEvent(milestoneDTO("2026-10-06"))).toMatchObject({
      kind: "milestone",
      date: "2026-10-06",
      startDate: "2026-10-06",
      dueDate: "2026-10-06",
      spanDays: 1,
    });
  });

  it("没有目标日期的里程碑不上日历", () => {
    expect(milestoneToEvent(milestoneDTO(null))).toBeNull();
  });

  it("跨天任务只在区间内生成事件，最后一天标记 endsToday", () => {
    const task = {
      id: "t1",
      projectId: "p1",
      title: "联调",
      startDate: "2026-10-05",
      dueDate: "2026-10-06",
      status: "in_progress" as const,
    };
    expect(taskEventsForDate(task, "2026-10-04")).toBeNull();
    expect(taskEventsForDate(task, "2026-10-05")).toMatchObject({
      spanDays: 2,
      endsToday: false,
    });
    expect(taskEventsForDate(task, "2026-10-06")).toMatchObject({
      spanDays: 2,
      endsToday: true,
    });
  });

  it("完成 / 逾期 / 风险判定", () => {
    const today = "2026-10-08";
    expect(eventIsDone(taskEvent({ taskStatus: "accepted" }))).toBe(true);
    expect(eventIsOverdue(taskEvent(), today)).toBe(true);
    expect(eventIsOverdue(taskEvent({ taskStatus: "accepted" }), today)).toBe(false);
    expect(eventIsAtRisk(taskEvent({ dueDate: today }), today)).toBe(true);
    expect(eventIsAtRisk(taskEvent({ dueDate: "2026-10-20" }), today)).toBe(false);
    expect(eventIsAtRisk(milestoneToEvent(milestoneDTO(today))!, today)).toBe(false);
  });

  it("任务事件保留里程碑归属，节点事件用自身 id", () => {
    const event = taskEventsForDate(
      {
        id: "t9",
        title: "挂节点的任务",
        startDate: "2026-10-05",
        dueDate: "2026-10-05",
        status: "in_progress",
        milestoneId: "m7",
      },
      "2026-10-05",
    )!;
    expect(event.milestoneId).toBe("m7");
    expect(milestoneToEvent(milestoneDTO("2026-10-05"))!.milestoneId).toBe("m1");
  });
});

describe("shapeEvents：视图筛选", () => {
  const milestone = () => milestoneToEvent(milestoneDTO("2026-10-05"))!;

  it("无筛选时原样返回", () => {
    const events = [taskEvent(), milestone()];
    expect(shapeEvents(events, {})).toHaveLength(2);
  });

  it("按状态筛任务，任务类筛选同时排除里程碑", () => {
    const events = [
      taskEvent({ id: "a", taskStatus: "submitted" }),
      taskEvent({ id: "b", taskStatus: "in_progress" }),
      milestone(),
    ];
    const shaped = shapeEvents(events, { status: ["submitted"] });
    expect(shaped.map((e) => e.id)).toEqual(["a"]);
  });

  it("按里程碑筛任务，不筛里程碑自身", () => {
    const events = [
      taskEvent({ id: "a", milestoneId: "m1" }),
      taskEvent({ id: "b", milestoneId: "m2" }),
      milestone(),
    ];
    const shaped = shapeEvents(events, { milestoneId: "m1" });
    expect(shaped.map((e) => e.id)).toEqual(["a"]);
  });

  it("riskOnly 只留逾期未完成", () => {
    const events = [
      taskEvent({ id: "risk", dueDate: "2020-01-01" }),
      taskEvent({ id: "done", dueDate: "2020-01-01", taskStatus: "accepted" }),
      taskEvent({ id: "later", dueDate: "2099-01-01" }),
    ];
    expect(shapeEvents(events, { riskOnly: true }, "2026-10-04").map((e) => e.id)).toEqual([
      "risk",
    ]);
  });
});

describe("按天聚合", () => {
  it("空日不返回，并按日期升序", () => {
    const days = groupByDay(
      [
        taskEvent({ date: "2026-10-07", id: "b" }),
        taskEvent({ date: "2026-10-05", id: "a" }),
      ],
      "2026-10-05",
    );
    expect(days.map((d) => d.iso)).toEqual(["2026-10-05", "2026-10-07"]);
    expect(days[0].isToday).toBe(true);
    expect(days[0].weekday).toBe("周一");
  });

  it("同一天里程碑排在任务之前", () => {
    const milestone = milestoneToEvent(milestoneDTO("2026-10-05"))!;
    const days = groupByDay([taskEvent({ date: "2026-10-05" }), milestone], "2026-10-05");
    expect(days[0].items.map((e) => e.kind)).toEqual(["milestone", "task"]);
    expect(compareEvents(milestone, taskEvent())).toBeLessThan(0);
  });
});

describe("URL 视图状态", () => {
  it("缺省 = 今天的月视图", () => {
    const q = parseCalendarQuery(new URLSearchParams(), "2026-10-04");
    expect(q).toEqual({ year: 2026, month: 10, view: "month", filters: {} });
  });

  it("解析视图、月份与筛选，非法月份回落到 1 月", () => {
    const q = parseCalendarQuery(
      new URLSearchParams("year=2026&month=13&view=agenda&status=in_progress&risk=1"),
      "2026-10-04",
    );
    expect(q.month).toBe(1);
    expect(q.view).toBe("agenda");
    expect(q.filters.status).toEqual(["in_progress"]);
    expect(q.filters.riskOnly).toBe(true);
  });

  it("忽略未知状态值", () => {
    const q = parseCalendarQuery(new URLSearchParams("status=nope"), "2026-10-04");
    expect(q.filters.status).toBeUndefined();
  });

  it("序列化可回读（往返一致）", () => {
    const p = serializeCalendarQuery({
      year: 2026,
      month: 10,
      view: "agenda",
      filters: { status: ["submitted"], riskOnly: true, assigneeId: "u1" },
    });
    const back = parseCalendarQuery(p, "2026-10-04");
    expect(back.view).toBe("agenda");
    expect(back.filters).toEqual({
      status: ["submitted"],
      riskOnly: true,
      assigneeId: "u1",
    });
    expect(p.get("view")).toBe("agenda");
  });

  it("todayISO 与 addDays 自洽", () => {
    const today = todayISO();
    expect(addDays(today, 0)).toBe(today);
    expect(addDays(today, 1) > today).toBe(true);
  });
});

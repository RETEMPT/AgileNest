import { beforeEach, describe, expect, it } from "vitest";
import {
  addMilestoneRow,
  addTask,
  asTeacher,
  makeFixture,
  makeUser,
  resetDb,
} from "./fixtures";
import {
  agendaWindow,
  calendarBoard,
  listAgenda,
  listAgendaDays,
  monthView,
  parseCalendarQuery,
} from "@/modules/calendar";
import type { CalendarEvent } from "@/modules/calendar/client";
import { addDaysISO, todayISO } from "@/modules/core/dates";

const titlesOn = (events: CalendarEvent[]) => events.map((e) => e.title);

describe("monthView：落格规则", () => {
  beforeEach(resetDb);

  it("单日任务按截止日落格，42 格含前后补齐", async () => {
    const { admin, team, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "交开题报告", dueDate: "2026-10-06" });

    const cells = await monthView(admin.id, project.id, 2026, 10);
    expect(cells).toHaveLength(42);
    expect(cells[0].iso).toBe("2026-09-28");
    expect(cells[41].iso).toBe("2026-11-08");
    expect(cells[0].inMonth).toBe(false);

    const cell = cells.find((c) => c.iso === "2026-10-06")!;
    expect(titlesOn(cell.events)).toEqual(["交开题报告"]);
    void team;
  });

  it("跨天任务在区间内每一天都出现（排期而不是只挂截止日）", async () => {
    const { admin, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "接口联调",
      startDate: "2026-10-05",
      dueDate: "2026-10-07",
      status: "in_progress",
    });

    const cells = await monthView(admin.id, project.id, 2026, 10);
    const byIso = new Map(cells.map((c) => [c.iso, c]));
    for (const iso of ["2026-10-05", "2026-10-06", "2026-10-07"]) {
      expect(titlesOn(byIso.get(iso)!.events), iso).toEqual(["接口联调"]);
    }
    expect(byIso.get("2026-10-04")!.events).toHaveLength(0);
    expect(byIso.get("2026-10-06")!.events[0]).toMatchObject({
      spanDays: 3,
      endsToday: false,
      date: "2026-10-06",
    });
    expect(byIso.get("2026-10-07")!.events[0].endsToday).toBe(true);
  });

  it("里程碑按目标日落格，没有目标日期的不上日历", async () => {
    const { admin, project } = await makeFixture();
    await addMilestoneRow({ projectId: project.id, title: "中期检查", targetDate: "2026-10-06" });
    await addMilestoneRow({ projectId: project.id, title: "结题", targetDate: "2027-05-31" });
    await addMilestoneRow({ projectId: project.id, title: "待定的节点", targetDate: null });

    const cells = await monthView(admin.id, project.id, 2026, 10);
    const cell = cells.find((c) => c.iso === "2026-10-06")!;
    expect(cell.events.map((e) => e.kind)).toEqual(["milestone"]);
    expect(titlesOn(cell.events)).toEqual(["中期检查"]);
    expect(cells.every((c) => !titlesOn(c.events).includes("待定的节点"))).toBe(true);
    expect(cells.every((c) => !titlesOn(c.events).includes("结题"))).toBe(true);
  });

  it("无起止日期的任务不上日历（由任务池负责）", async () => {
    const { admin, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "尚未排期" });

    const cells = await monthView(admin.id, project.id, 2026, 10);
    expect(cells.every((c) => c.events.length === 0)).toBe(true);
  });

  it("事件带出负责人与优先级，省掉二次查询", async () => {
    const { admin, student, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "写中期报告",
      dueDate: "2026-10-06",
      assigneeId: student.id,
      priority: "high",
      status: "in_progress",
    });

    const cells = await monthView(admin.id, project.id, 2026, 10);
    const event = cells.find((c) => c.iso === "2026-10-06")!.events[0];
    expect(event.assigneeName).toBe("student");
    expect(event.assigneeId).toBe(student.id);
    expect(event.priority).toBe("high");
    expect(event.taskStatus).toBe("in_progress");
  });

  it("学生/教师都能读，外部人读不到", async () => {
    const { student, teacher, outsider, project } = await makeFixture();
    await expect(monthView(student.id, project.id, 2026, 10)).resolves.toHaveLength(42);
    await expect(monthView(teacher.id, project.id, 2026, 10)).resolves.toHaveLength(42);
    await expect(monthView(outsider.id, project.id, 2026, 10)).rejects.toThrow("没有权限");
  });

  it("非法月份抛可展示错误", async () => {
    const { admin, project } = await makeFixture();
    await expect(monthView(admin.id, project.id, 2026, 13)).rejects.toThrow("月份需在 1–12");
    await expect(monthView(admin.id, project.id, 2026, 0)).rejects.toThrow("月份需在 1–12");
  });
});

describe("listAgenda / listAgendaDays", () => {
  beforeEach(resetDb);

  it("窗口内按日期升序，里程碑排在同日任务之前", async () => {
    const { admin, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "提交代码",
      startDate: "2026-10-05",
      dueDate: "2026-10-06",
    });
    await addMilestoneRow({ projectId: project.id, title: "中期检查", targetDate: "2026-10-05" });

    const days = await listAgendaDays(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-07",
    });
    expect(days.map((d) => d.iso)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(days[0].weekday).toBe("周一");
    expect(days[0].items.map((e) => e.kind)).toEqual(["milestone", "task"]);
    expect(days[0].items[1].spanDays).toBe(2);
  });

  it("跨天任务在窗口外被裁剪", async () => {
    const { admin, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "答辩演练",
      startDate: "2026-10-04",
      dueDate: "2026-10-08",
    });

    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-06",
      to: "2026-10-07",
    });
    expect(events.map((e) => e.date)).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("默认窗口 = 今天起 14 天", async () => {
    const { admin, project } = await makeFixture();
    const today = todayISO();
    await addTask({ projectId: project.id, title: "今天到期", dueDate: today });

    const events = await listAgenda(admin.id, project.id);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe(today);
    expect(events[0].endsToday).toBe(true);
  });

  it("只读日期区间过滤日期任务，包含跨越窗口起点的长任务", async () => {
    const { admin, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "长任务",
      startDate: "2026-01-01",
      dueDate: "2026-12-31",
    });
    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-06",
    });
    expect(events.map((e) => e.date)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("按状态筛选，教师可读，外部人拒绝", async () => {
    const { admin, student, outsider, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "待验收的",
      dueDate: "2026-10-05",
      status: "submitted",
    });
    await addTask({
      projectId: project.id,
      title: "进行中的",
      dueDate: "2026-10-05",
      status: "in_progress",
    });

    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-05",
      filters: { status: ["submitted"] },
    });
    expect(titlesOn(events)).toEqual(["待验收的"]);

    await expect(
      listAgenda(student.id, project.id, { from: "2026-10-05", to: "2026-10-05" }),
    ).resolves.toHaveLength(2);
    await expect(listAgenda(outsider.id, project.id, {})).rejects.toThrow("没有权限");
  });

  it("按负责人筛选", async () => {
    const { admin, student, project } = await makeFixture();
    const other = await makeUser("other@agilenest.local");
    await addTask({
      projectId: project.id,
      title: "学生的活",
      dueDate: "2026-10-05",
      assigneeId: student.id,
    });
    await addTask({
      projectId: project.id,
      title: "别人的活",
      dueDate: "2026-10-05",
      assigneeId: other.id,
    });

    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-05",
      filters: { assigneeId: student.id },
    });
    expect(titlesOn(events)).toEqual(["学生的活"]);
  });

  it("按里程碑筛选任务", async () => {
    const { admin, project } = await makeFixture();
    const milestone = await addMilestoneRow({
      projectId: project.id,
      title: "中期",
      targetDate: "2026-10-05",
    });
    await addTask({
      projectId: project.id,
      title: "挂节点的活",
      dueDate: "2026-10-05",
      milestoneId: milestone.id,
    });
    await addTask({ projectId: project.id, title: "没节点的活", dueDate: "2026-10-05" });

    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-05",
      filters: { milestoneId: milestone.id },
    });
    expect(titlesOn(events)).toEqual(["挂节点的活"]);
  });

  it("status 筛选会同时排掉里程碑（只看任务）", async () => {
    const { admin, project } = await makeFixture();
    await addMilestoneRow({ projectId: project.id, title: "中期", targetDate: "2026-10-05" });
    await addTask({
      projectId: project.id,
      title: "进行中的",
      dueDate: "2026-10-05",
      status: "in_progress",
    });

    const events = await listAgenda(admin.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-05",
      filters: { status: ["in_progress"] },
    });
    expect(titlesOn(events)).toEqual(["进行中的"]);
  });

  it("riskOnly 只留逾期未完成与今天到期", async () => {
    const { admin, project } = await makeFixture();
    const today = todayISO();
    await addTask({ projectId: project.id, title: "早就逾期", dueDate: "2020-01-01", status: "in_progress" });
    await addTask({ projectId: project.id, title: "逾期但已完成", dueDate: "2020-01-01", status: "accepted" });
    await addTask({ projectId: project.id, title: "今天到期", dueDate: today, status: "in_progress" });
    await addTask({ projectId: project.id, title: "还早", dueDate: "2099-01-01", status: "in_progress" });

    const events = await listAgenda(admin.id, project.id, {
      from: "2020-01-01",
      to: "2099-01-01",
      filters: { riskOnly: true },
    });
    expect(titlesOn(events).sort()).toEqual(["今天到期", "早就逾期"].sort());
  });

  it("riskOnly 默认窗口也往回看，不漏掉逾期任务", async () => {
    const { admin, project } = await makeFixture();
    await addTask({
      projectId: project.id,
      title: "上个月就逾期",
      dueDate: addDaysISO(todayISO(), -30),
      status: "in_progress",
    });

    // 不给 from/to，默认窗口必须包含历史逾期
    const events = await listAgenda(admin.id, project.id, { filters: { riskOnly: true } });
    expect(titlesOn(events)).toEqual(["上个月就逾期"]);
  });

  it("起止写反抛可展示错误", async () => {
    const { admin, project } = await makeFixture();
    await expect(
      listAgenda(admin.id, project.id, { from: "2026-10-10", to: "2026-10-01" }),
    ).rejects.toThrow("结束日期不能早于开始日期");
  });

  it("教师身份不影响只读日历", async () => {
    const { admin, teacher, team, project } = await makeFixture();
    await asTeacher(team.id, teacher.id);
    await addTask({ projectId: project.id, title: "节点任务", dueDate: "2026-10-05" });
    const events = await listAgenda(teacher.id, project.id, {
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(titlesOn(events)).toEqual(["节点任务"]);
    void admin;
  });
});

describe("calendarBoard / agendaWindow", () => {
  beforeEach(resetDb);

  it("月视图侧栏固定未来两周，日程视图覆盖整月", async () => {
    const { admin, project } = await makeFixture();
    const today = todayISO();
    await addTask({ projectId: project.id, title: "今天", dueDate: today });

    const board = await calendarBoard(admin.id, project.id, { year: 2026, month: 10 });
    expect(board.cells).toHaveLength(42);
    expect(board.days.length).toBeGreaterThan(0);
    expect(board.days[0].iso).toBe(today);
  });

  it("agendaWindow 随视图切换", () => {
    const month = agendaWindow({ year: 2026, month: 2, view: "month" }, "2026-10-04");
    expect(month).toEqual({ from: "2026-10-04", to: "2026-10-17" });

    const agenda = agendaWindow({ year: 2026, month: 2, view: "agenda" }, "2026-10-04");
    expect(agenda).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("parseCalendarQuery 与 agendaWindow 串起来可用", async () => {
    const { admin, project } = await makeFixture();
    await addTask({ projectId: project.id, title: "二月的事", dueDate: "2026-02-10" });
    const query = parseCalendarQuery(new URLSearchParams("view=agenda&year=2026&month=2"), "2026-10-04");
    const window = agendaWindow(query, "2026-10-04");

    const events = await listAgenda(admin.id, project.id, window);
    expect(titlesOn(events)).toEqual(["二月的事"]);
  });
});

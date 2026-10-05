import type { MilestoneKind, TaskPriority, TaskStatus } from "@/db/schema";
import { todayISO } from "@/modules/core/dates";
import type { MilestoneDTO } from "@/modules/milestone";

/**
 * 日历/日程的纯计算层（浏览器安全）：
 * 只依赖类型与 core/dates，不引入 db，供 client 组件、service 与测试共用。
 */

export type CalendarView = "month" | "agenda";

export type CalendarFilters = {
  status?: TaskStatus[];
  assigneeId?: string;
  milestoneId?: string;
  /** agenda 视图只看逾期未完成 + 今天到期 */
  riskOnly?: boolean;
};

export type CalendarQuery = {
  year: number;
  /** 1-12 */
  month: number;
  view: CalendarView;
  filters: CalendarFilters;
};

type DatedTask = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  assigneeId?: string | null;
  assigneeName?: string | null;
  priority?: TaskPriority;
  milestoneId?: string | null;
};

/** 日历/日程统一事件：任务与里程碑共用一个形状，UI 只认它。 */
export type CalendarEvent = {
  id: string;
  kind: "task" | "milestone";
  title: string;
  /** 起止来自 date 列（YYYY-MM-DD）；里程碑两端都是 targetDate */
  startDate: string | null;
  dueDate: string | null;
  taskStatus: TaskStatus | null;
  milestoneKind: MilestoneKind | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: TaskPriority | null;
  /** 任务挂的里程碑；里程碑事件为空 */
  milestoneId: string | null;
  /** 落在日历上的那一天 */
  date: string;
  /** 任务跨越的总天数，1 表示单日 */
  spanDays: number;
  /** 是否为跨天任务的最后一天 */
  endsToday: boolean;
};

export type CalendarCell = {
  iso: string;
  inMonth: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
};

export type AgendaDay = {
  iso: string;
  weekday: string;
  isToday: boolean;
  items: CalendarEvent[];
};

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export const WEEKDAY_LABELS: readonly string[] = WEEKDAYS;

export function weekdayLabel(iso: string): string {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return WEEKDAYS[(day + 6) % 7];
}

export function isWeekendISO(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function stepDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return todayISO(d);
}

/** 今天起 N 天（日程窗口用）。 */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/**
 * 任务占用的日期：startDate 到 dueDate 之间每一天。
 * 只给一个日期时就是单日事件；两个都没有则不上日历（由任务池负责呈现）。
 */
export function taskDates(task: {
  startDate: string | null;
  dueDate: string | null;
}): string[] {
  const { startDate, dueDate } = task;
  if (!startDate && !dueDate) return [];
  const from = startDate ?? dueDate!;
  const to = dueDate ?? startDate!;
  if (from > to) return [dueDate ?? startDate!];
  const days: string[] = [];
  for (let iso = from; iso <= to; iso = stepDay(iso)) days.push(iso);
  return days;
}

/** 事件落在 [from, to] 窗口内的日期（闭区间）。 */
export function calendarRange(
  event: { startDate: string | null; dueDate: string | null },
  from: string,
  to: string,
): string[] {
  return taskDates(event).filter((iso) => iso >= from && iso <= to);
}

export function milestoneToEvent(milestone: MilestoneDTO): CalendarEvent | null {
  if (!milestone.targetDate) return null;
  return {
    id: milestone.id,
    kind: "milestone",
    title: milestone.title,
    startDate: milestone.targetDate,
    dueDate: milestone.targetDate,
    taskStatus: null,
    milestoneKind: milestone.kind,
    assigneeId: null,
    assigneeName: null,
    priority: null,
    milestoneId: milestone.id,
    date: milestone.targetDate,
    spanDays: 1,
    endsToday: true,
  };
}

/** 跨天任务在日历上每一天都出现，最后一天标记 endsToday。 */
export function taskEventsForDate(task: DatedTask, iso: string): CalendarEvent | null {
  const dates = taskDates(task);
  if (!dates.includes(iso)) return null;
  return {
    id: task.id,
    kind: "task",
    title: task.title,
    startDate: task.startDate,
    dueDate: task.dueDate,
    taskStatus: task.status,
    milestoneKind: null,
    assigneeId: task.assigneeId ?? null,
    assigneeName: task.assigneeName ?? null,
    priority: task.priority ?? null,
    milestoneId: task.milestoneId ?? null,
    date: iso,
    spanDays: dates.length,
    endsToday: iso === dates[dates.length - 1],
  };
}

export function eventIsDone(event: CalendarEvent): boolean {
  return event.kind === "task" && event.taskStatus === "accepted";
}

export function eventIsOverdue(event: CalendarEvent, today = todayISO()): boolean {
  return (
    event.kind === "task" &&
    !!event.dueDate &&
    event.dueDate < today &&
    !eventIsDone(event)
  );
}

/** 逾期风险：逾期未完成，或今天到期且还没做完。 */
export function eventIsAtRisk(event: CalendarEvent, today = todayISO()): boolean {
  if (event.kind !== "task" || eventIsDone(event)) return false;
  if (!event.dueDate) return false;
  return event.dueDate <= today;
}

/** 月视图上/下一个月，跨年自动进位。 */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function currentYearMonth(today = todayISO()): { year: number; month: number } {
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** 月视图 42 格（周一为一周起点），与 core.monthGrid 同构。 */
export function monthGridRange(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - startPad);

  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(todayISO(d));
  }
  return cells;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 某月的第一天与最后一天（日程视图按整月取窗口）。 */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${monthKey(year, month)}-01`,
    to: `${monthKey(year, month)}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 1970 && year <= 9999 && Number.isInteger(month) && month >= 1 && month <= 12;
}

export function shapeEvents(
  events: CalendarEvent[],
  filters: CalendarFilters = {},
  today = todayISO(),
): CalendarEvent[] {
  return events.filter((event) => {
    if (filters.riskOnly && !eventIsAtRisk(event, today)) return false;
    // 只看任务时（状态/负责人/里程碑筛选），里程碑不参与
    const taskOnly =
      !!filters.status?.length || !!filters.assigneeId || !!filters.milestoneId;
    if (event.kind === "milestone") return !taskOnly;
    if (filters.status?.length && !filters.status.includes(event.taskStatus!)) return false;
    if (filters.assigneeId && event.assigneeId !== filters.assigneeId) return false;
    if (filters.milestoneId && event.milestoneId !== filters.milestoneId) return false;
    return true;
  });
}

/** events → 每天一组；空日不返回。 */
export function groupByDay(
  events: CalendarEvent[],
  today = todayISO(),
): AgendaDay[] {
  const days = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const bucket = days.get(event.date);
    if (bucket) bucket.push(event);
    else days.set(event.date, [event]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([iso, items]) => ({
      iso,
      weekday: weekdayLabel(iso),
      isToday: iso === today,
      items: [...items].sort(compareEvents),
    }));
}

export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.kind !== b.kind) return a.kind === "milestone" ? -1 : 1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.title.localeCompare(b.title, "zh-Hans-CN");
}

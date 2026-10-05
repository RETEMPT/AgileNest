import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import { milestones, tasks, users, type TaskStatus } from "@/db/schema";
import { AppError } from "@/modules/core/errors";
import { addDaysISO, todayISO } from "@/modules/core/dates";
import { requireProjectForUser } from "@/modules/core/permissions";
import { toDTO, type TaskRow } from "@/modules/tasks";
import { TASK_STATUSES } from "@/modules/tasks/client";
import type { MilestoneDTO } from "@/modules/milestone";
import {
  addDays,
  calendarRange,
  eventIsAtRisk,
  groupByDay,
  isValidYearMonth,
  milestoneToEvent,
  monthBounds,
  monthGridRange,
  monthKey,
  shiftMonth,
  taskDates,
  taskEventsForDate,
  weekdayLabel,
  type AgendaDay,
  type CalendarCell,
  type CalendarEvent,
  type CalendarFilters,
  type CalendarQuery,
  type CalendarView,
} from "./model";

/** 保留原始 DTO 形状，便于看板/表格等复用同一批任务对象。 */
export type CalendarTask = ReturnType<typeof toDTO>;

export type { CalendarCell };

function isoOrNull(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function taskSelect() {
  return { ...getTableColumns(tasks), assigneeName: users.name };
}

/** 该项目里带日期的任务（起止任一非空），日历与日程共用同一批。 */
async function loadDatedTasks(projectId: string): Promise<TaskRow[]> {
  return db
    .select(taskSelect())
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        eq(tasks.projectId, projectId),
        or(isNotNull(tasks.startDate), isNotNull(tasks.dueDate)),
      ),
    );
}

async function loadMilestonesInRange(
  projectId: string,
  from: string,
  to: string,
): Promise<MilestoneDTO[]> {
  const rows = await db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, projectId),
        isNotNull(milestones.targetDate),
        gte(milestones.targetDate, from),
        lte(milestones.targetDate, to),
      ),
    )
    .orderBy(asc(milestones.targetDate));
  return rows.map((m) => ({
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    description: m.description,
    kind: m.kind,
    targetDate: m.targetDate,
    status: m.status,
    createdAt: m.createdAt,
  }));
}

/** 任务 → 落在窗口内每一天的事件（跨天任务在每一天都出现）。 */
function taskEventsInRange(
  rows: TaskRow[],
  from: string,
  to: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    const dto = toDTO(row);
    for (const iso of calendarRange(dto, from, to)) {
      const event = taskEventsForDate(dto, iso);
      if (event) events.push(event);
    }
  }
  return events;
}

function taskEventsOnDates(rows: TaskRow[], isos: string[]): CalendarEvent[] {
  const wanted = new Set(isos);
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    const dto = toDTO(row);
    for (const iso of taskDates(dto)) {
      if (!wanted.has(iso)) continue;
      const event = taskEventsForDate(dto, iso);
      if (event) events.push(event);
    }
  }
  return events;
}

function shapeEvents(events: CalendarEvent[], filters: CalendarFilters): CalendarEvent[] {
  const taskOnly =
    !!filters.status?.length || !!filters.assigneeId || !!filters.milestoneId;
  return events.filter((event) => {
    if (event.kind === "milestone") return !taskOnly;
    if (filters.status?.length && !filters.status.includes(event.taskStatus!)) return false;
    if (filters.assigneeId && event.assigneeId !== filters.assigneeId) return false;
    if (filters.milestoneId && event.milestoneId !== filters.milestoneId) return false;
    return true;
  });
}

/**
 * 月视图：42 格（含前后补齐）。
 * 单日任务按截止日落格；跨天任务在区间内每一天都出现，等于「排期」视图。
 */
export async function monthView(
  actorId: string,
  projectId: string,
  year: number,
  /** 1-12 */
  month: number,
): Promise<CalendarCell[]> {
  await requireProjectForUser(actorId, projectId);
  if (!isValidYearMonth(year, month)) throw new AppError("月份需在 1–12");

  const cells = monthGridRange(year, month);
  const from = cells[0];
  const to = cells[cells.length - 1];

  const [taskRows, milestoneList] = await Promise.all([
    loadDatedTasks(projectId),
    loadMilestonesInRange(projectId, from, to),
  ]);

  const events = [
    ...taskEventsOnDates(taskRows, cells),
    ...milestoneList
      .map(milestoneToEvent)
      .filter((e): e is CalendarEvent => e !== null),
  ];

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.date);
    if (bucket) bucket.push(event);
    else byDate.set(event.date, [event]);
  }

  const key = monthKey(year, month);
  return cells.map((iso) => ({
    iso,
    inMonth: iso.slice(0, 7) === key,
    isWeekend: new Date(`${iso}T00:00:00`).getDay() % 6 === 0,
    events: byDate.get(iso) ?? [],
  }));
}

/** 日历页用：同一批数据同时给月网格与日程，避免重复读库。 */
export async function calendarBoard(
  actorId: string,
  projectId: string,
  input: { year: number; month: number; horizonDays?: number },
): Promise<{ cells: CalendarCell[]; days: AgendaDay[] }> {
  await requireProjectForUser(actorId, projectId);
  const today = todayISO();
  const [cells, events] = await Promise.all([
    monthView(actorId, projectId, input.year, input.month),
    listAgendaEvents(
      projectId,
      today,
      addDays(today, (input.horizonDays ?? 14) - 1),
    ),
  ]);
  return { cells, days: groupByDay(events, today) };
}

async function listAgendaEvents(
  projectId: string,
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const [taskRows, milestoneList] = await Promise.all([
    loadDatedTasks(projectId),
    loadMilestonesInRange(projectId, from, to),
  ]);
  return [
    ...taskEventsInRange(taskRows, from, to),
    ...milestoneList
      .map(milestoneToEvent)
      .filter((e): e is CalendarEvent => e !== null),
  ];
}

/**
 * 日程：窗口内每一天的事件（默认今天起 14 天），按日期升序。
 * 与月视图共用 `taskDates`，保证同一任务两处落在同一天。
 */
export async function listAgenda(
  actorId: string,
  projectId: string,
  range?: { from?: string; to?: string; filters?: CalendarFilters },
): Promise<CalendarEvent[]> {
  await requireProjectForUser(actorId, projectId);

  const today = todayISO();
  const filters = range?.filters ?? {};
  // 逾期风险要往回看：默认窗口从今天起会把已经逾期的任务排除在外。
  const defaultFrom = filters.riskOnly ? addDays(today, -90) : today;
  const from = isoOrNull(range?.from ?? null) ?? defaultFrom;
  const to = isoOrNull(range?.to ?? null) ?? addDays(today, 13);
  if (from > to) throw new AppError("结束日期不能早于开始日期");

  const events = await listAgendaEvents(projectId, from, to);
  const shaped = shapeEvents(events, filters).filter(
    (event) => !filters.riskOnly || eventIsAtRisk(event, today),
  );
  return shaped.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

/** 日程按天聚合，空日不返回。 */
export async function listAgendaDays(
  actorId: string,
  projectId: string,
  range?: { from?: string; to?: string; filters?: CalendarFilters },
): Promise<AgendaDay[]> {
  const events = await listAgenda(actorId, projectId, range);
  return groupByDay(events);
}

export function parseCalendarFilters(params: URLSearchParams): CalendarFilters {
  const status: TaskStatus[] = [];
  for (const value of params.getAll("status")) {
    const match = TASK_STATUSES.find((s) => s === value);
    if (match) status.push(match);
  }
  const assigneeId = params.get("assigneeId") || undefined;
  const milestoneId = params.get("milestoneId") || undefined;
  const riskOnly = params.get("risk") === "1";
  return {
    ...(status.length && { status }),
    ...(assigneeId && { assigneeId }),
    ...(milestoneId && { milestoneId }),
    ...(riskOnly && { riskOnly }),
  };
}

/** URL 是视图唯一真相：月份、视图与筛选都可以分享/后退。 */
export function parseCalendarQuery(
  params: URLSearchParams,
  today = todayISO(),
): CalendarQuery {
  const year = Number(params.get("year")) || Number(today.slice(0, 4));
  const month = Number(params.get("month")) || Number(today.slice(5, 7));
  const view = params.get("view") === "agenda" ? "agenda" : "month";
  return {
    year,
    month: isValidYearMonth(year, month) ? month : 1,
    view,
    filters: parseCalendarFilters(params),
  };
}

export function serializeCalendarQuery(query: CalendarQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set("year", String(query.year));
  p.set("month", String(query.month));
  if (query.view === "agenda") p.set("view", "agenda");
  for (const s of query.filters.status ?? []) p.append("status", s);
  if (query.filters.assigneeId) p.set("assigneeId", query.filters.assigneeId);
  if (query.filters.milestoneId) p.set("milestoneId", query.filters.milestoneId);
  if (query.filters.riskOnly) p.set("risk", "1");
  return p;
}

/** 日程窗口：月视图看未来两周，日程视图看整月。 */
export function agendaWindow(
  query: Pick<CalendarQuery, "year" | "month" | "view">,
  today = todayISO(),
): { from: string; to: string } {
  if (query.view === "agenda") return monthBounds(query.year, query.month);
  return { from: today, to: addDays(today, 13) };
}

export { shiftMonth, weekdayLabel };
export type { CalendarView };

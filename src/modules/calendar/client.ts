import { z } from "zod";
import { isValidISODate } from "@/modules/core/dates";
export {
  WEEKDAY_LABELS, addDays, calendarRange, compareEvents, currentYearMonth,
  eventIsAtRisk, eventIsDone, eventIsOverdue, groupByDay, isValidYearMonth,
  isWeekendISO, milestoneToEvent, monthBounds, monthGridRange, monthKey,
  shapeEvents, shiftMonth, taskDates, taskEventsForDate, weekdayLabel,
} from "./model";
export type {
  AgendaDay, CalendarCell, CalendarEvent, CalendarFilters, CalendarView,
  CalendarQuery as ProjectCalendarQuery,
} from "./model";

export const SCHEDULE_PRIORITIES = [0, 1, 2] as const;
export type SchedulePriority = (typeof SCHEDULE_PRIORITIES)[number];
export const PRIORITY_META = {
  0: { label: "普通", className: "bg-brand-soft text-brand" },
  1: { label: "重要", className: "bg-orange-50 text-orange-800" },
  2: { label: "紧急", className: "bg-red-50 text-red-700" },
} as const;

export type ScheduleDTO = {
  id: string;
  title: string;
  description: string;
  scheduleDate: string;
  startTime: string | null;
  endTime: string | null;
  priority: SchedulePriority;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const scheduleDateSchema = z.iso
  .date({ error: "请选择有效日期" })
  .refine(isValidISODate)
  .refine(
    (value) => value >= "1900-01-01" && value <= "2100-12-31",
    "日期需在 1900–2100 年之间",
  );
const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间需为有效的 HH:mm")
  .nullable()
  .default(null);

export const scheduleInputSchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, "请填写日程标题")
      .max(100, "标题最多 100 字"),
    description: z.string().trim().max(500, "说明最多 500 字").default(""),
    scheduleDate: scheduleDateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    priority: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  })
  .superRefine((value, context) => {
    if ((value.startTime === null) !== (value.endTime === null)) {
      context.addIssue({
        code: "custom",
        message: "请同时填写开始和结束时间，或选择全天",
        path: ["endTime"],
      });
    } else if (
      value.startTime !== null &&
      value.endTime !== null &&
      value.startTime >= value.endTime
    ) {
      context.addIssue({
        code: "custom",
        message: "结束时间必须晚于开始时间；跨日安排请分日创建",
        path: ["endTime"],
      });
    }
  });
export type ScheduleInput = z.input<typeof scheduleInputSchema>;

export const calendarMonthSchema = z.strictObject({
  year: z
    .number()
    .int()
    .min(1900, "年份需在 1900–2100")
    .max(2100, "年份需在 1900–2100"),
  month: z.number().int().min(1, "月份需在 1–12").max(12, "月份需在 1–12"),
});

export type CalendarSearchParams = {
  y?: string | string[];
  m?: string | string[];
  date?: string | string[];
  q?: string | string[];
  priority?: string | string[];
};
export type CalendarQuery = {
  year: number;
  month: number;
  date: string;
  q: string;
  priority: SchedulePriority | null;
};

export function parseCalendarQuery(
  params: CalendarSearchParams,
  today: string,
): CalendarQuery {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const fallback = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  const parsed = calendarMonthSchema.safeParse({
    year: first(params.y) ? Number(first(params.y)) : fallback.year,
    month: first(params.m) ? Number(first(params.m)) : fallback.month,
  });
  const { year, month } = parsed.success ? parsed.data : fallback;
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const selected = scheduleDateSchema.safeParse(first(params.date));
  const date =
    selected.success && selected.data.startsWith(`${prefix}-`)
      ? selected.data
      : today.startsWith(`${prefix}-`)
        ? today
        : `${prefix}-01`;
  return {
    year,
    month,
    date,
    q: first(params.q).trim().slice(0, 100),
    priority: ["0", "1", "2"].includes(first(params.priority))
      ? (Number(first(params.priority)) as SchedulePriority)
      : null,
  };
}

export function calendarUrl(
  query: CalendarQuery,
  changes: Partial<CalendarQuery> = {},
): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams({
    y: String(next.year),
    m: String(next.month),
    date: next.date,
  });
  if (next.q) params.set("q", next.q);
  if (next.priority !== null) params.set("priority", String(next.priority));
  return `/calendar?${params}`;
}

export function selectSchedules(
  items: ScheduleDTO[],
  query: Pick<CalendarQuery, "q" | "priority">,
): ScheduleDTO[] {
  const needle = query.q.toLocaleLowerCase();
  return items
    .filter(
      (item) =>
        (query.priority === null || item.priority === query.priority) &&
        (!needle ||
          `${item.title}\n${item.description}`
            .toLocaleLowerCase()
            .includes(needle)),
    )
    .sort(
      (a, b) =>
        a.scheduleDate.localeCompare(b.scheduleDate) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        b.priority - a.priority ||
        a.id.localeCompare(b.id),
    );
}

export function scheduleTimeLabel(
  schedule: Pick<ScheduleDTO, "startTime" | "endTime">,
): string {
  return schedule.startTime && schedule.endTime
    ? `${schedule.startTime}–${schedule.endTime}`
    : "全天";
}

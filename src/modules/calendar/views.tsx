import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { daysBetween, todayISO } from "@/modules/core/dates";
import { CalendarWorkspace } from "./ui";
import {
  agendaWindow,
  calendarBoard,
  parseCalendarQuery,
} from "./service";
import type { CalendarQuery } from "./client";

function toParams(query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      params.append(key, item);
    }
  }
  return params;
}

/** 日历页组合：URL 决定月份与视图，service 只读一次数据。 */
export async function CalendarWorkspaceView({
  projectId,
  query,
}: {
  projectId: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const today = todayISO();
  const parsed: CalendarQuery = parseCalendarQuery(toParams(query), today);
  const window = agendaWindow(parsed, today);
  const horizonDays =
    parsed.view === "agenda"
      ? Math.max(1, daysBetween(today, window.to) + 1)
      : 14;

  const { cells, days } = await calendarBoard(user.id, projectId, {
    year: parsed.year,
    month: parsed.month,
    horizonDays,
  });

  // 日程视图按整月取窗口；月视图的侧栏固定看近两周。
  const agendaDays =
    parsed.view === "agenda"
      ? days.filter((day) => day.iso >= window.from && day.iso <= window.to)
      : days;

  return (
    <CalendarWorkspace
      projectId={projectId}
      year={parsed.year}
      month={parsed.month}
      view={parsed.view}
      today={today}
      cells={cells}
      days={agendaDays}
      filters={parsed.filters}
      canReview={access.capabilities.review}
    />
  );
}

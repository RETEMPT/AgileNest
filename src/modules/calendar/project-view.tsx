import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { addDaysISO, todayISO } from "@/modules/core/dates";
import { CalendarWorkspace } from "./project-ui";
import {
  agendaWindow,
  calendarBoard,
  parseCalendarQuery,
} from "./service";
import type { ProjectCalendarQuery } from "./client";

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
  const params = toParams(query);
  if (!params.has("year") && params.has("y")) params.set("year", params.get("y")!);
  if (!params.has("month") && params.has("m")) params.set("month", params.get("m")!);
  const parsed: ProjectCalendarQuery = parseCalendarQuery(params, today);
  const window = parsed.filters.riskOnly
    ? { from: addDaysISO(today, -90), to: today }
    : agendaWindow(parsed, today);

  const { cells, days } = await calendarBoard(user.id, projectId, {
    year: parsed.year,
    month: parsed.month,
    range: window,
    filters: parsed.filters,
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

export async function ProjectCalendarView({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  return <CalendarWorkspaceView projectId={projectId} query={query} />;
}

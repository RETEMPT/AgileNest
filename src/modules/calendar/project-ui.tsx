"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { Badge, StatusPill, PriorityPill } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS,
  currentYearMonth,
  eventIsDone,
  eventIsOverdue,
  shiftMonth,
  type AgendaDay,
  type CalendarCell,
  type CalendarEvent,
  type CalendarFilters,
  type CalendarView,
} from "./model";

const STATUS_BG: Record<string, string> = {
  unclaimed: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-amber-50 text-amber-800",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const MILESTONE_BG = "bg-brand-soft text-brand";

export function EventChip({
  projectId,
  event,
  today,
  className,
}: {
  projectId: string;
  event: CalendarEvent;
  today: string;
  className?: string;
}) {
  const overdue = eventIsOverdue(event, today);
  const done = eventIsDone(event);
  return (
    <Link
      href={
        event.kind === "milestone"
          ? `/p/${projectId}/milestones`
          : `/p/${projectId}/tasks/${event.id}`
      }
      title={`${event.title}${event.spanDays > 1 ? `（跨 ${event.spanDays} 天）` : ""}`}
      className={cn(
        "block truncate rounded px-1 py-0.5 text-[10px] leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        event.kind === "milestone"
          ? MILESTONE_BG
          : STATUS_BG[event.taskStatus ?? "unclaimed"],
        done && "line-through opacity-70",
        overdue && "ring-1 ring-destructive/60",
        className,
      )}
    >
      {event.kind === "milestone" ? "◆ " : ""}
      {event.title}
    </Link>
  );
}

export function MonthGrid({
  projectId,
  cells,
  today,
  maxPerCell = 3,
}: {
  projectId: string;
  cells: CalendarCell[];
  today: string;
  maxPerCell?: number;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((cell) => {
        const extra = cell.events.length - maxPerCell;
        return (
          <div
            key={cell.iso}
            className={cn(
              "min-h-[88px] rounded-md border border-border p-1.5",
              cell.inMonth ? "bg-card" : "bg-muted/40 opacity-60",
              cell.isWeekend && cell.inMonth && "bg-secondary/40",
              cell.iso === today && "border-brand/60 ring-1 ring-brand/30",
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={cn(
                  "text-[11px] text-muted-foreground",
                  cell.iso === today && "font-semibold text-brand",
                )}
              >
                {Number(cell.iso.slice(8, 10))}
              </span>
              {cell.events.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {cell.events.length}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {cell.events.slice(0, maxPerCell).map((event) => (
                <EventChip
                  key={`${event.kind}-${event.id}-${event.date}`}
                  projectId={projectId}
                  event={event}
                  today={today}
                />
              ))}
              {extra > 0 && (
                <p className="px-1 text-[10px] text-muted-foreground">+{extra} 项</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AgendaList({
  projectId,
  days,
  today,
  emptyText = "这段时间没有排期。",
}: {
  projectId: string;
  days: AgendaDay[];
  today: string;
  emptyText?: string;
}) {
  if (days.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ol className="space-y-3">
      {days.map((day) => (
        <li key={day.iso} className="rounded-lg border border-border bg-card">
          <div
            className={cn(
              "flex items-center gap-2 rounded-t-lg border-b border-border px-3 py-1.5 text-xs",
              day.isToday ? "bg-accent text-accent-foreground" : "bg-muted/50",
            )}
          >
            <span className="font-medium">{day.iso}</span>
            <span className="text-muted-foreground">{day.weekday}</span>
            {day.isToday && <Badge>今天</Badge>}
            <span className="ml-auto text-muted-foreground">{day.items.length} 项</span>
          </div>
          <ul className="divide-y divide-border">
            {day.items.map((event) => {
              const overdue = eventIsOverdue(event, today);
              const done = eventIsDone(event);
              return (
                <li
                  key={`${event.kind}-${event.id}-${event.date}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <Link
                    href={
                      event.kind === "milestone"
                        ? `/p/${projectId}/milestones`
                        : `/p/${projectId}/tasks/${event.id}`
                    }
                    className={cn(
                      "min-w-0 flex-1 truncate hover:underline",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {event.kind === "milestone" && (
                      <span className="mr-1 text-[color:var(--terracotta)]">◆</span>
                    )}
                    {event.title}
                  </Link>
                  {event.spanDays > 1 && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {event.endsToday ? `跨 ${event.spanDays} 天 · 今天截止` : `跨 ${event.spanDays} 天`}
                    </span>
                  )}
                  {event.assigneeName && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                      {event.assigneeName}
                    </span>
                  )}
                  {overdue && <Badge variant="destructive">逾期</Badge>}
                  {event.kind === "milestone" ? (
                    <Badge variant="secondary">里程碑</Badge>
                  ) : (
                    <>
                      {event.priority && <PriorityPill priority={event.priority} />}
                      <StatusPill status={event.taskStatus ?? "unclaimed"} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function CalendarWorkspace({
  projectId,
  year,
  month,
  view,
  today,
  cells,
  days,
  filters,
  canReview,
}: {
  projectId: string;
  year: number;
  month: number;
  view: CalendarView;
  today: string;
  cells: CalendarCell[];
  days: AgendaDay[];
  filters: CalendarFilters;
  canReview: boolean;
}) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const now = currentYearMonth(today);
  const buildHref = (input: {
    year?: number;
    month?: number;
    view?: CalendarView;
    risk?: boolean;
  }) => {
    const p = new URLSearchParams();
    p.set("year", String(input.year ?? year));
    p.set("month", String(input.month ?? month));
    if ((input.view ?? view) === "agenda") p.set("view", "agenda");
    for (const s of filters.status ?? []) p.append("status", s);
    if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
    if (filters.milestoneId) p.set("milestoneId", filters.milestoneId);
    if (input.risk ?? filters.riskOnly) p.set("risk", "1");
    return `/p/${projectId}/calendar?${p.toString()}`;
  };

  const shown = filters.riskOnly
    ? days
        .map((day) => ({
          ...day,
          items: day.items.filter(
            (event) =>
              event.kind === "task" &&
              !eventIsDone(event) &&
              !!event.dueDate &&
              event.dueDate <= today,
          ),
        }))
        .filter((day) => day.items.length > 0)
    : days;

  const monthEvents = cells.reduce((sum, cell) => sum + cell.events.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={buildHref({ ...prev, view })}
            aria-label="上一个月"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="w-32 text-center text-sm font-medium">
            {year} 年 {month} 月
          </span>
          <Link
            href={buildHref({ ...next, view })}
            aria-label="下一个月"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {(year !== now.year || month !== now.month) && (
          <Link
            href={buildHref({ year: now.year, month: now.month, view })}
            className="text-xs text-brand hover:underline"
          >
            回到本月
          </Link>
        )}

        <nav className="ml-auto flex gap-1 rounded-md bg-muted p-0.5 text-xs">
          <Link
            href={buildHref({ view: "month" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
              view === "month"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            月视图
          </Link>
          <Link
            href={buildHref({ view: "agenda" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
              view === "agenda"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListChecks className="h-3.5 w-3.5" />
            日程表
          </Link>
          <Link
            href={buildHref({ view: "agenda", risk: !filters.riskOnly })}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              filters.riskOnly
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            逾期风险
          </Link>
        </nav>
      </div>

      <p className="text-xs text-muted-foreground">
        {view === "month"
          ? `单日任务按截止日落格，跨天任务在区间内每天出现；本月 ${monthEvents} 个落格事件。`
          : "按日期列出排期：任务按起止区间展开，里程碑按目标日。"}
      </p>

      {view === "month" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <MonthGrid projectId={projectId} cells={cells} today={today} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>近两周日程</CardTitle>
            </CardHeader>
            <CardContent>
              <AgendaList projectId={projectId} days={shown} today={today} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{filters.riskOnly ? "逾期风险" : `${month} 月日程`}</CardTitle>
            {canReview && (
              <p className="text-xs text-muted-foreground">
                验收台可批量处理待验收任务。
              </p>
            )}
          </CardHeader>
          <CardContent>
            <AgendaList
              projectId={projectId}
              days={shown}
              today={today}
              emptyText={filters.riskOnly ? "没有逾期或今天到期的任务。" : "本月没有排期。"}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

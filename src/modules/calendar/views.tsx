import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { requireUser, todayISO, monthGrid } from "@/modules/core";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { listMySchedules } from "./schedule-service";
import {
  calendarUrl,
  parseCalendarQuery,
  PRIORITY_META,
  selectSchedules,
  scheduleTimeLabel,
  type CalendarSearchParams,
} from "./client";
import { ScheduleControls } from "./ui";
export { ProjectCalendarView } from "./project-view";

export async function PersonalCalendarView({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const user = await requireUser();
  const today = todayISO();
  const query = parseCalendarQuery(await searchParams, today);
  const schedules = await listMySchedules(user.id, query.year, query.month);
  const visible = selectSchedules(schedules, query);
  const selected = visible.filter((item) => item.scheduleDate === query.date);
  const byDay = new Map<string, typeof visible>();
  for (const item of visible) {
    const day = byDay.get(item.scheduleDate) ?? [];
    day.push(item);
    byDay.set(item.scheduleDate, day);
  }
  const previous =
    query.month === 1
      ? { year: query.year - 1, month: 12 }
      : { year: query.year, month: query.month - 1 };
  const next =
    query.month === 12
      ? { year: query.year + 1, month: 1 }
      : { year: query.year, month: query.month + 1 };
  const filtered = Boolean(query.q || query.priority !== null);
  const dateLabel = `${Number(query.date.slice(5, 7))} 月 ${Number(query.date.slice(8, 10))} 日`;
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand">
            <CalendarDays className="h-4 w-4" />
            时间安排
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            个人日历
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            管理个人日程，仅本人可见。团队任务和里程碑在项目日历查看。
          </p>
        </div>
        <ScheduleControls query={query} mode="create" />
      </header>
      <section
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        aria-label="月历与日程"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tabular-nums">
              {query.year} 年 {query.month} 月
            </h2>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              {schedules.length} 项日程
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <Link
                href={calendarUrl(query, {
                  year: Number(today.slice(0, 4)),
                  month: Number(today.slice(5, 7)),
                  date: today,
                })}
              >
                今天
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link
                aria-label="上个月"
                aria-disabled={previous.year < 1900}
                tabIndex={previous.year < 1900 ? -1 : undefined}
                className={
                  previous.year < 1900 ? "pointer-events-none opacity-40" : ""
                }
                href={calendarUrl(query, {
                  ...previous,
                  date: `${previous.year}-${String(previous.month).padStart(2, "0")}-01`,
                })}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link
                aria-label="下个月"
                aria-disabled={next.year > 2100}
                tabIndex={next.year > 2100 ? -1 : undefined}
                className={
                  next.year > 2100 ? "pointer-events-none opacity-40" : ""
                }
                href={calendarUrl(query, {
                  ...next,
                  date: `${next.year}-${String(next.month).padStart(2, "0")}-01`,
                })}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <form
          action="/calendar"
          className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-5 py-3"
        >
          <input type="hidden" name="y" value={query.year} />
          <input type="hidden" name="m" value={query.month} />
          <input type="hidden" name="date" value={query.date} />
          <div className="relative min-w-0 flex-1 basis-44">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              key={query.q}
              aria-label="搜索日程"
              placeholder="搜索标题或说明"
              defaultValue={query.q}
              maxLength={100}
              className="pl-9"
            />
          </div>
          <Select
            name="priority"
            key={query.priority}
            aria-label="日程优先级筛选"
            defaultValue={query.priority === null ? "" : String(query.priority)}
            className="w-32"
          >
            <option value="">全部优先级</option>
            {([0, 1, 2] as const).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_META[value].label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline" size="sm">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            筛选
          </Button>
          {filtered && (
            <Button asChild variant="ghost" size="sm">
              <Link href={calendarUrl(query, { q: "", priority: null })}>
                清除筛选
              </Link>
            </Button>
          )}
        </form>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 p-3 sm:p-5">
            <div className="mb-2 grid grid-cols-7 text-center text-xs text-muted-foreground">
              {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>
            <div
              className="grid grid-cols-7 gap-1 sm:gap-1.5"
              aria-label="选择日期"
            >
              {monthGrid(query.year, query.month).map((cell) => {
                const items = byDay.get(cell.iso) ?? [];
                const className = cn(
                  "min-w-0 min-h-16 rounded-lg border p-1.5 text-left transition sm:min-h-28 sm:p-2",
                  cell.inMonth
                    ? "border-border bg-background"
                    : "border-transparent bg-muted/30 text-muted-foreground",
                  cell.iso === query.date &&
                    "border-brand/50 bg-brand-soft ring-1 ring-brand/20",
                  "hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                );
                const content = (
                  <>
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        cell.iso === today && "bg-brand text-white",
                      )}
                    >
                      {Number(cell.iso.slice(8, 10))}
                    </span>
                    <div className="mt-1 hidden space-y-1 sm:block">
                      {items.slice(0, 2).map((item) => (
                        <span
                          key={item.id}
                          title={`${scheduleTimeLabel(item)} ${item.title}`}
                          className={cn(
                            "block truncate rounded px-1.5 py-1 text-[10px]",
                            PRIORITY_META[item.priority].className,
                          )}
                        >
                          {item.startTime ? `${item.startTime} ` : ""}
                          {item.title}
                        </span>
                      ))}
                      {items.length > 2 && (
                        <span className="block px-1 text-[10px] text-muted-foreground">
                          另 {items.length - 2} 项
                        </span>
                      )}
                    </div>
                    {items.length > 0 && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-brand sm:hidden">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-brand" />
                        {items.length} 项
                      </span>
                    )}
                  </>
                );
                return cell.inMonth ? (
                  <Link
                    key={cell.iso}
                    href={calendarUrl(query, { date: cell.iso })}
                    aria-label={`${cell.iso}，${items.length} 项日程`}
                    aria-current={cell.iso === query.date ? "date" : undefined}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={cell.iso} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {([0, 1, 2] as const).map((priority) => (
                <span key={priority} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      priority === 2
                        ? "bg-red-500"
                        : priority === 1
                          ? "bg-orange-500"
                          : "bg-brand",
                    )}
                  />
                  {PRIORITY_META[priority].label}
                </span>
              ))}
              {filtered && (
                <span className="ml-auto">筛选后 {visible.length} 项</span>
              )}
            </div>
          </div>
          <aside
            className="min-w-0 border-t border-border bg-muted/15 p-5 lg:border-l lg:border-t-0"
            aria-label="当日日程"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3
                  id="daily-schedule-title"
                  tabIndex={-1}
                  className="font-semibold"
                >
                  {dateLabel}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {query.date === today ? "今天 · " : ""}
                  {selected.length} 项日程
                </p>
              </div>
              <ScheduleControls query={query} mode="create" compact />
            </div>
            {selected.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <CalendarDays className="mx-auto h-7 w-7 text-brand/50" />
                <p className="mt-3 text-sm font-medium">
                  {filtered ? "当天没有匹配日程" : "当天暂无安排"}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {filtered
                    ? "可以清除筛选，查看当天全部安排。"
                    : "选择日期后添加课程、会议或个人计划。"}
                </p>
                {filtered && (
                  <Button asChild variant="ghost" size="sm" className="mt-3">
                    <Link href={calendarUrl(query, { q: "", priority: null })}>
                      清除筛选
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {selected.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {scheduleTimeLabel(item)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          PRIORITY_META[item.priority].className,
                        )}
                      >
                        {PRIORITY_META[item.priority].label}
                      </span>
                    </div>
                    <h4 className="break-words text-sm font-semibold leading-6">
                      {item.title}
                    </h4>
                    {item.description && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <ScheduleControls
                      query={query}
                      schedule={item}
                      mode="manage"
                    />
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

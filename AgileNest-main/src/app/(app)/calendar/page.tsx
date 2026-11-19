import { PersonalCalendarView } from "@/modules/calendar/views";
import type { CalendarSearchParams } from "@/modules/calendar/client";

export const metadata = { title: "个人日历 · AgileNest" };
export default function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  return <PersonalCalendarView searchParams={searchParams} />;
}

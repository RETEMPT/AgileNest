import { ProjectCalendarView } from "@/modules/calendar/views";

export default function CalendarPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProjectCalendarView {...props} />;
}

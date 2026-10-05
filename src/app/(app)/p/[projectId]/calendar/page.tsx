import { ProjectCalendarView } from "@/modules/calendar/views";

export default function CalendarPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  return <ProjectCalendarView {...props} />;
}

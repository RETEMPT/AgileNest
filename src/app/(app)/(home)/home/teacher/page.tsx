import { WorkbenchView } from "@/modules/review/views";
export default function TeacherHome() {
  return <WorkbenchView searchParams={Promise.resolve({ view: "review" })} />;
}

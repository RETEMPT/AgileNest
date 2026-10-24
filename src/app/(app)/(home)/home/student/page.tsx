import { WorkbenchView } from "@/modules/review/views";
export default function StudentHome() {
  return <WorkbenchView searchParams={Promise.resolve({ view: "mine" })} />;
}

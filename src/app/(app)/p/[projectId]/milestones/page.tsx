import { MilestonesView } from "@/modules/milestone/views";

export default function MilestonesPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <MilestonesView params={params} />;
}

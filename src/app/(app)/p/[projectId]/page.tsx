import { ProjectOverviewView } from "@/modules/identity/views";

export default function ProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  return <ProjectOverviewView params={params} />;
}

import { TaskPoolView } from "@/modules/tasks/views";

export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <TaskPoolView projectId={projectId} />;
}

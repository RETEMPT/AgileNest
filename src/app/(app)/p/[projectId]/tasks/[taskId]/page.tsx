import { TaskDetailView } from "@/modules/tasks/views";

export default function TaskDetailPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  return <TaskDetailView params={params} />;
}

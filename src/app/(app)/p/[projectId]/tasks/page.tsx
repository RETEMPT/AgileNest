import { TaskPoolView } from "@/modules/tasks/views";

export default async function TasksPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  return <TaskPoolView projectId={projectId} query={await searchParams} />;
}

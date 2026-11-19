import { ProjectWorkspaceView } from "@/modules/board/views";

export default async function TablePage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  return <ProjectWorkspaceView projectId={projectId} query={await searchParams} view="table" />;
}

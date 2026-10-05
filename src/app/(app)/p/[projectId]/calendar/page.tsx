import { CalendarWorkspaceView } from "@/modules/calendar";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">日历</h1>
        <p className="text-sm text-muted-foreground">
          任务截止 + 跨天排期 + 里程碑；月份与视图走 URL，可分享可后退
        </p>
      </header>
      <CalendarWorkspaceView projectId={projectId} query={query} />
    </main>
  );
}

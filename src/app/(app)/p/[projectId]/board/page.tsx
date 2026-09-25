import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listProjectTasks } from "@/modules/tasks";
import { deriveColumns } from "@/modules/board";
import { TaskCard } from "@/modules/tasks/ui";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const tasks = await listProjectTasks(user.id, projectId, { parentTaskId: null });
  const columns = deriveColumns(tasks, "status");

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">看板</h1>
        <p className="text-sm text-muted-foreground">
          五态流水线 · 用按钮推进状态
        </p>
      </header>

      <div className="grid gap-3 overflow-x-auto lg:grid-cols-5">
        {columns.map((col) => (
          <section key={col.id} className="min-w-[200px] space-y-2">
            <h2 className="font-display text-xs font-semibold text-muted-foreground">
              {col.title}（{col.tasks.length}）
            </h2>
            {col.tasks.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                空
              </p>
            )}
            {col.tasks.map((t) => (
              <TaskCard key={t.id} task={t} role={access.role} actorId={user.id} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

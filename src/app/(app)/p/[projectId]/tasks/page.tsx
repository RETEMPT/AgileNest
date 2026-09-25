import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listProjectTasks } from "@/modules/tasks";
import { CreateTaskForm, TaskCard } from "@/modules/tasks/ui";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const tasks = await listProjectTasks(user.id, projectId, { parentTaskId: null });

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">任务池</h1>
        <p className="text-sm text-muted-foreground">
          共 {tasks.length} 个顶层任务 · 认领后提交，教师验收
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {tasks.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              还没有任务，右侧「新建任务」开始。
            </p>
          )}
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} role={access.role} actorId={user.id} />
          ))}
        </div>
        <CreateTaskForm projectId={projectId} />
      </div>
    </main>
  );
}

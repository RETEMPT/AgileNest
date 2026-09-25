import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listProjectTasks } from "@/modules/tasks";
import { StatusPill, PriorityPill } from "@/components/ui/badge";

export default async function TablePage({
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
        <h1 className="font-display text-2xl font-semibold">表格</h1>
        <p className="text-sm text-muted-foreground">同一份 tasks 数据 · {tasks.length} 行</p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">标题</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">优先</th>
              <th className="px-3 py-2">负责</th>
              <th className="px-3 py-2">截止</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-muted-foreground">
                  暂无任务
                </td>
              </tr>
            )}
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/p/${projectId}/tasks/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={t.status} />
                </td>
                <td className="px-3 py-2">
                  <PriorityPill priority={t.priority} />
                </td>
                <td className="px-3 py-2">{t.assigneeName ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.dueDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

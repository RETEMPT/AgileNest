import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listPendingReview, listOverdueRisks } from "@/modules/review";
import { TaskCard } from "@/modules/tasks/ui";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  if (access.role === "student") {
    return (
      <main className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">验收台</h1>
        <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          仅教师 / 管理员可验收。学生请在
          <Link href={`/p/${projectId}/tasks`} className="mx-1 text-primary hover:underline">
            任务池
          </Link>
          查看进度。
        </p>
      </main>
    );
  }

  const [pending, overdue] = await Promise.all([
    listPendingReview(user.id, projectId),
    listOverdueRisks(user.id, projectId),
  ]);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">验收台</h1>
        <p className="text-sm text-muted-foreground">
          待验收 {pending.length} · 逾期 {overdue.length}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">待验收</h2>
        {pending.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            队列已清空
          </p>
        )}
        {pending.map((t) => (
          <div key={t.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <Link href={`/p/${projectId}/tasks/${t.id}`} className="font-medium hover:underline">
              {t.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              提交人 {t.submitterName ?? "—"}
              {t.completionNote ? ` · ${t.completionNote}` : ""}
            </p>
            <TaskCard task={t} role={access.role} actorId={user.id} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">逾期风险</h2>
        {overdue.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            暂无
          </p>
        )}
        {overdue.map((t) => (
          <TaskCard key={t.id} task={t} role={access.role} actorId={user.id} />
        ))}
      </section>
    </main>
  );
}

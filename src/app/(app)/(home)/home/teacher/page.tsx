import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyProjects } from "@/modules/identity";
import {
  listOverdueRisks,
  listPendingReview,
  type ReviewItem,
} from "@/modules/review";
import { TaskCard } from "@/modules/tasks/ui";

export default async function TeacherHome() {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);

  const pending: (ReviewItem & { projectName: string })[] = [];
  const overdue: Awaited<ReturnType<typeof listOverdueRisks>> = [];

  for (const p of projects) {
    const [rev, od] = await Promise.all([
      listPendingReview(user.id, p.id),
      listOverdueRisks(user.id, p.id),
    ]);
    pending.push(...rev.map((r) => ({ ...r, projectName: p.name })));
    overdue.push(...od);
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">教学监督台</h1>
        <p className="text-sm text-muted-foreground">
          待验收队列 · 逾期风险 · 项目入口 —— 过程性评价有据可依。
        </p>
      </header>

      <section className="flex flex-wrap gap-2 text-sm">
        {projects.length === 0 && (
          <p className="text-muted-foreground">
            还没有项目，去 <Link href="/t" className="text-primary hover:underline">我的团队</Link> 创建。
          </p>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}/review`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-accent"
          >
            {p.name}
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-muted-foreground">
            待验收（{pending.length}）
          </h2>
          {pending.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              暂无待验收任务
            </p>
          )}
          {pending.map((t) => (
            <div key={t.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {t.projectName} · 提交人 {t.submitterName ?? "—"}
                {t.submittedAt ? ` · ${new Date(t.submittedAt).toLocaleString("zh-CN")}` : ""}
              </p>
              {t.completionNote && (
                <p className="rounded-md bg-muted px-2 py-1.5 text-sm">{t.completionNote}</p>
              )}
              <TaskCard task={t} role="teacher" actorId={user.id} />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-muted-foreground">
            逾期风险（{overdue.length}）
          </h2>
          {overdue.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              暂无逾期
            </p>
          )}
          {overdue.map((t) => (
            <TaskCard key={t.id} task={t} role="teacher" actorId={user.id} />
          ))}
        </section>
      </div>
    </main>
  );
}

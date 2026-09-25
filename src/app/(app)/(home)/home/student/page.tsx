import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyProjects } from "@/modules/identity";
import {
  listMyInProgress,
  listMyRejected,
  listMyTodo,
} from "@/modules/review";
import { TaskCard } from "@/modules/tasks/ui";

export default async function StudentHome() {
  const user = await requireUser();
  const [todo, doing, rejected, projects] = await Promise.all([
    listMyTodo(user.id),
    listMyInProgress(user.id),
    listMyRejected(user.id),
    listMyProjects(user.id),
  ]);

  const cols = [
    { title: "待认领", items: todo },
    { title: "进行中", items: doing },
    { title: "待修改", items: rejected },
  ] as const;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">今日工作台</h1>
        <p className="text-sm text-muted-foreground">
          待认领 · 进行中 · 待修改 —— 认领 → 做事 → 提交。
        </p>
      </header>

      <section className="flex flex-wrap gap-2 text-sm">
        {projects.length === 0 && (
          <p className="text-muted-foreground">
            还没有项目，去{" "}
            <Link href="/t" className="text-primary hover:underline">
              我的团队
            </Link>{" "}
            建一个吧。
          </p>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/p/${p.id}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-accent"
          >
            {p.name}
            <span className="ml-2 text-xs text-muted-foreground">{p.teamName}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((c) => (
          <section key={c.title} className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-muted-foreground">
              {c.title}（{c.items.length}）
            </h2>
            {c.items.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                暂无
              </p>
            )}
            {c.items.map((t) => (
              <TaskCard key={t.id} task={t} role="student" actorId={user.id} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyProjects } from "@/modules/identity";
import {
  listMyInProgress,
  listMyRejected,
  listMyTodo,
} from "@/modules/review";
import { WorkstreamCard } from "@/components/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { TelemetryCard } from "@/components/cards/telemetry-card";

export default async function StudentHome() {
  const user = await requireUser();
  const [todo, doing, rejected, projects] = await Promise.all([
    listMyTodo(user.id),
    listMyInProgress(user.id),
    listMyRejected(user.id),
    listMyProjects(user.id),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const cols = [
    {
      title: "待认领池",
      badge: "可领取",
      items: todo,
      emptyText: "暂无可认领任务，可联系团队负责人指派或创建。",
    },
    {
      title: "正在推进",
      badge: "进行中",
      items: doing,
      emptyText: "当前没有进行中的任务，快去认领一个开始工作吧！",
    },
    {
      title: "待修改任务",
      badge: "需关注",
      items: rejected,
      emptyText: "棒极了！当前没有被教师打回修改的任务。",
    },
  ] as const;

  return (
    <main className="space-y-6">
      {/* 顶部遥测与概览 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            学生工作台
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            认领池 → 进行中 → 提交完成说明 → 教师验收打回闭环。
          </p>
        </div>
      </div>

      {/* 关键指标概览卡片 (Telemetry Cards) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TelemetryCard
          title="待认领任务"
          value={todo.length}
          unit="项"
          subtitle="来自所属各课程设计项目"
          badge="公共池"
          badgeColor="bg-slate-100 text-slate-700 border-slate-200"
        />
        <TelemetryCard
          title="进行中工作"
          value={doing.length}
          unit="项"
          subtitle="完成子任务后可附带说明提交"
          badge="在办中"
          badgeColor="bg-blue-50 text-blue-700 border-blue-200"
        />
        <TelemetryCard
          title="待修改打回"
          value={rejected.length}
          unit="项"
          subtitle="请查看教师意见后重交"
          badge={rejected.length > 0 ? "需尽快修改" : "无风险"}
          badgeColor={
            rejected.length > 0
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }
        />
      </div>

      {/* 快捷项目列表 */}
      {projects.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground mr-1">快捷直达:</span>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="rounded-lg border border-border bg-card px-2.5 py-1 hover:border-foreground/30 transition shadow-2xs font-medium"
            >
              {p.name}
              <span className="ml-1.5 text-[10px] text-muted-foreground">({p.teamName})</span>
            </Link>
          ))}
        </section>
      )}

      {/* 三列工作流流水线卡片区 */}
      <div className="grid gap-5 lg:grid-cols-3">
        {cols.map((c) => (
          <section key={c.title} className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/80 pb-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {c.title}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.2 text-[11px] font-bold text-muted-foreground">
                  {c.items.length}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{c.badge}</span>
            </div>

            {c.items.length === 0 ? (
              <EmptyState title="暂无相关任务" description={c.emptyText} className="py-8" />
            ) : (
              <div className="space-y-3">
                {c.items.map((t) => (
                  <WorkstreamCard
                    key={t.id}
                    task={t}
                    role="student"
                    actorId={user.id}
                    showProjectBadge={true}
                    projectName={projectMap.get(t.projectId)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

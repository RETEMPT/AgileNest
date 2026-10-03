import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyProjects } from "@/modules/identity";
import {
  listOverdueRisks,
  listPendingReview,
  type ReviewItem,
} from "@/modules/review";
import { WorkstreamCard } from "@/components/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { TelemetryCard } from "@/components/cards/telemetry-card";

export default async function TeacherHome() {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);

  const results = await Promise.all(
    projects.map(async (p) => {
      const [rev, od] = await Promise.all([
        listPendingReview(user.id, p.id),
        listOverdueRisks(user.id, p.id),
      ]);
      return {
        pending: rev.map((r) => ({ ...r, projectName: p.name })),
        overdue: od,
      };
    }),
  );

  const pending: (ReviewItem & { projectName: string })[] = [];
  const overdue: Awaited<ReturnType<typeof listOverdueRisks>> = [];
  for (const r of results) {
    pending.push(...r.pending);
    overdue.push(...r.overdue);
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            教学监督与验收大盘
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            多项目待验收审核队列 · 逾期进度风险监控 · 过程性评价支撑体系。
          </p>
        </div>
      </div>

      {/* 关键监督指标 (Telemetry Cards) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TelemetryCard
          title="待教师验收"
          value={pending.length}
          unit="项"
          subtitle="学生已提交，需把关或打回"
          badge={pending.length > 0 ? "待处理" : "已清空"}
          badgeColor={
            pending.length > 0
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }
        />
        <TelemetryCard
          title="逾期预警风险"
          value={overdue.length}
          unit="项"
          subtitle="已超过既定截止日期的任务"
          badge={overdue.length > 0 ? "需督促" : "正常"}
          badgeColor={
            overdue.length > 0
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }
        />
        <TelemetryCard
          title="监管项目总数"
          value={projects.length}
          unit="个"
          subtitle="所指导或管理的课程设计组"
          badge="全部在轨"
          badgeColor="bg-blue-50 text-blue-700 border-blue-200"
        />
      </div>

      {/* 快速直达项目 */}
      {projects.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground mr-1">监管项目直达:</span>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}/review`}
              className="rounded-lg border border-border bg-card px-2.5 py-1 hover:border-foreground/30 transition shadow-2xs font-medium"
            >
              {p.name}
              <span className="ml-1.5 text-[10px] text-muted-foreground">({p.teamName})</span>
            </Link>
          ))}
        </section>
      )}

      {/* 核心双流看板：待验收 vs 逾期风险 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 待验收流水线 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-foreground">
                待验收队列
              </h2>
              <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.2 text-[11px] font-bold">
                {pending.length}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">审核通过或打回附意见</span>
          </div>

          {pending.length === 0 ? (
            <EmptyState
              title="暂无待验收任务"
              description="所有学生提交的任务均已完成验收审核，队列已清空。"
              className="py-10"
            />
          ) : (
            <div className="space-y-3">
              {pending.map((t) => (
                <WorkstreamCard
                  key={t.id}
                  task={t}
                  role="teacher"
                  actorId={user.id}
                  showProjectBadge={true}
                  projectName={t.projectName}
                />
              ))}
            </div>
          )}
        </section>

        {/* 逾期风险流水线 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-foreground">
                逾期进度预警
              </h2>
              <span className="rounded-full bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 px-2 py-0.2 text-[11px] font-bold">
                {overdue.length}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">超过截止日未完成</span>
          </div>

          {overdue.length === 0 ? (
            <EmptyState
              title="全员进度健康"
              description="当前没有逾期未交付的任务，团队推进顺利。"
              className="py-10"
            />
          ) : (
            <div className="space-y-3">
              {overdue.map((t) => (
                <WorkstreamCard
                  key={t.id}
                  task={t}
                  role="teacher"
                  actorId={user.id}
                  showProjectBadge={true}
                  variant="minimal"
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

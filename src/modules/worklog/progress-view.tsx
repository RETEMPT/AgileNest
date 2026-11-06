import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  Flag,
  TriangleAlert,
} from "lucide-react";
import { isOverdue, requireUser, getProjectForUser, todayISO } from "@/modules/core";
import { TASK_STATUSES, STATUS_LABELS } from "@/modules/tasks";
import type { TaskStatus } from "@/db/schema";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { projectProgress, type ProgressMilestone, type ProgressWeek } from "./progress";

const STATUS_BAR: Record<TaskStatus, string> = {
  unclaimed: "bg-status-unclaimed",
  in_progress: "bg-status-in-progress",
  submitted: "bg-status-submitted",
  accepted: "bg-status-accepted",
  rejected: "bg-status-rejected",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  unclaimed: "bg-status-unclaimed",
  in_progress: "bg-status-in-progress",
  submitted: "bg-status-submitted",
  accepted: "bg-status-accepted",
  rejected: "bg-status-rejected",
};

const MILESTONE_STATUS_LABEL = {
  open: "进行中",
  done: "已完成",
} as const;

function percent(value: number, total: number): number {
  return total ? Math.round((value / total) * 100) : 0;
}

function StatusDistribution({
  projectId,
  counts,
  total,
}: {
  projectId: string;
  counts: Record<TaskStatus, number>;
  total: number;
}) {
  if (!total) {
    return (
      <p className="mt-4 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
        尚未创建顶层任务，创建任务后这里会显示状态分布。
      </p>
    );
  }
  return (
    <>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`顶层任务五态分布：${TASK_STATUSES.map((status) => `${STATUS_LABELS[status]} ${counts[status]} 项`).join("，")}`}
      >
        {TASK_STATUSES.map((status) =>
          counts[status] ? (
            <span
              key={status}
              className={`h-full ${STATUS_BAR[status]}`}
              style={{ width: `${(counts[status] / total) * 100}%` }}
              title={`${STATUS_LABELS[status]} ${counts[status]} 项`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
        {TASK_STATUSES.map((status) => (
          <Link
            key={status}
            href={`/p/${projectId}/table?status=${status}`}
            className="group flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{STATUS_LABELS[status]}</span>
            <span className="font-semibold tabular-nums text-foreground">{counts[status]}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">点击状态查看对应任务</p>
    </>
  );
}

function MilestoneProgress({ projectId, milestones }: { projectId: string; milestones: ProgressMilestone[] }) {
  if (!milestones.length) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">
        还没有里程碑。可在「里程碑」中建立阶段后查看进度。
      </p>
    );
  }
  const today = todayISO();
  return (
    <ul className="divide-y divide-border">
      {milestones.map((milestone) => {
        const pct = percent(milestone.accepted, milestone.total);
        const late = milestone.status !== "done" && isOverdue(milestone.targetDate, today);
        const content = (
          <>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{milestone.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {milestone.status && <Badge variant={milestone.status === "done" ? "success" : "secondary"}>{MILESTONE_STATUS_LABEL[milestone.status]}</Badge>}
                  {milestone.targetDate ? <span className={late ? "text-destructive" : ""}>{late ? "已过目标 " : "目标 "}{milestone.targetDate}</span> : <span>未设目标日期</span>}
                  {milestone.overdue > 0 && <span className="text-destructive">逾期 {milestone.overdue} 项</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{milestone.accepted} / {milestone.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">{milestone.total ? `${pct}% 已验收` : "尚未关联任务"}</p>
              </div>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`${milestone.title}验收进度`}
              aria-valuemin={0}
              aria-valuemax={milestone.total || 1}
              aria-valuenow={milestone.accepted}
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
            </div>
          </>
        );
        return (
          <li key={milestone.id ?? "ungrouped"} className="px-4 py-4">
            {milestone.id ? (
              <Link href={`/p/${projectId}/milestones`} className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CompletionChart({ weeks }: { weeks: ProgressWeek[] }) {
  const max = Math.max(...weeks.map((week) => week.count), 1);
  const hasData = weeks.some((week) => week.count > 0);
  if (!hasData) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        <ChartNoAxesCombined className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">最近 8 周还没有验收记录</p>
        <p className="text-xs text-muted-foreground">任务验收后会按周汇总在这里</p>
      </div>
    );
  }
  return (
    <figure className="px-4 pb-4 pt-2" aria-label="近 8 周验收完成趋势">
      <div className="flex h-32 items-end gap-1" role="img" aria-label={weeks.map((week) => `${week.label} 完成 ${week.count} 项`).join("，")}>
        {weeks.map((week, index) => {
          const height = week.count ? Math.max(6, Math.round((week.count / max) * 112)) : 2;
          const current = index === weeks.length - 1;
          return (
            <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="h-4 text-xs tabular-nums text-muted-foreground">{week.count || ""}</span>
              <div className="flex h-24 w-full items-end">
                <div
                  className={`w-full rounded-t-sm ${week.count ? (current ? "bg-brand" : "bg-brand/55") : "bg-muted"}`}
                  style={{ height: `${height}px` }}
                  title={`${week.label}：${week.count} 项验收`}
                />
              </div>
              <span className={`text-xs tabular-nums ${current ? "text-brand" : "text-muted-foreground"}`}>{week.label}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">按任务验收时间统计，当前周在右侧</figcaption>
    </figure>
  );
}

export async function ProgressView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const progress = await projectProgress(user.id, projectId);
  const pct = percent(progress.accepted, progress.total);
  const riskCount = progress.attention;

  return (
    <main className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">任务进度</h1>
          <p className="mt-1 text-sm text-muted-foreground">{access.project.name} · 按顶层任务验收统计</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/p/${projectId}/stats`}>成员贡献</Link></Button>
          <Button asChild size="sm"><Link href={`/p/${projectId}/table`}>查看任务<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="项目进度摘要">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">验收完成率</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-brand">{progress.total ? `${pct}%` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">已验收 {progress.accepted} / {progress.total} 个顶层任务</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">正在推进</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{progress.active}</p>
          <p className="mt-1 text-xs text-muted-foreground">进行中 {progress.statusCounts.in_progress} · 待验收 {progress.statusCounts.submitted}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">需要关注</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-destructive">{riskCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">逾期 {progress.overdue} · 待修改 {progress.statusCounts.rejected}</p>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold">整体进度</h2>
                <p className="mt-1 text-xs text-muted-foreground">五态分布 · 顶层任务</p>
              </div>
              <Link href={`/p/${projectId}/table`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">任务列表<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
            <StatusDistribution projectId={projectId} counts={progress.statusCounts} total={progress.total} />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-display text-base font-semibold">里程碑进度</h2>
                <p className="mt-1 text-xs text-muted-foreground">按阶段查看顶层任务验收情况</p>
              </div>
              <Link href={`/p/${projectId}/milestones`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">全部里程碑<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
            <MilestoneProgress projectId={projectId} milestones={progress.milestones} />
          </Card>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium">统计口径</p>
                <p className="mt-1 text-xs leading-[18px] text-muted-foreground">
                  项目完成率只统计顶层任务；子任务共 {progress.subtaskTotal} 项，已验收 {progress.subtaskAccepted} 项，不计入上方百分比。
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
              <Flag className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs leading-[18px] text-muted-foreground">里程碑用于观察阶段进展，不改变任务状态或验收结果。</p>
            </div>
            {progress.overdue > 0 && (
              <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-destructive">
                <TriangleAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="text-xs leading-[18px]">有 {progress.overdue} 个逾期顶层任务需要跟进。</p>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-base font-semibold">近 8 周完成</h2>
              <p className="mt-1 text-xs text-muted-foreground">已验收顶层任务</p>
            </div>
            <CompletionChart weeks={progress.weeks} />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-display text-base font-semibold">需要关注</h2>
                <p className="mt-1 text-xs text-muted-foreground">逾期或待修改的顶层任务</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">{progress.attention}</span>
            </div>
            {progress.risks.length ? (
              <ul className="divide-y divide-border">
                {progress.risks.map((task) => (
                  <li key={task.id}>
                    <Link href={`/p/${projectId}/tasks/${task.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{task.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{task.assigneeName || "未认领"}{task.dueDate ? ` · 截止 ${task.dueDate}` : " · 未设截止日期"}</p>
                      </div>
                      <StatusPill status={task.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-accepted" aria-hidden="true" />
                当前没有逾期或待修改任务
              </div>
            )}
          </Card>

        </div>
      </div>
    </main>
  );
}

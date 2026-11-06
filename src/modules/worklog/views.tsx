import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { requireUser, getProjectForUser, isOverdue } from "@/modules/core";
import { TASK_STATUSES, STATUS_LABELS } from "@/modules/tasks";
import { memberContribution } from "@/modules/worklog";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TaskStatus } from "@/db/schema";

const STATUS_DOT: Record<TaskStatus, string> = {
  unclaimed: "bg-muted-foreground/30",
  in_progress: "bg-brand",
  submitted: "bg-muted-foreground/60",
  accepted: "bg-foreground",
  rejected: "bg-muted-foreground/45",
};

export async function StatsView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const contribution = await memberContribution(user.id, projectId);
  const isReviewer = access.capabilities.review;
  const total = contribution.reduce((sum, member) => sum + member.tasksTotal, 0);
  const accepted = contribution.reduce((sum, member) => sum + member.tasksAccepted, 0);
  const overdue = contribution.reduce((sum, member) => sum + member.overdue, 0);
  const completionRate = total ? Math.round((accepted / total) * 100) : 0;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {isReviewer ? "成员贡献" : "我的贡献"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {access.project.name} · {isReviewer ? "按成员查看任务完成情况" : "我的任务完成情况"} · 含子任务
          </p>
        </div>
        <Link href={`/p/${projectId}/table`} className="text-sm text-brand hover:underline">
          查看项目任务 →
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">验收完成率</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
            {total ? `${completionRate}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            已验收 {accepted} / {total} 项负责任务
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">负责任务</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{total}</p>
          <p className="mt-1 text-xs text-muted-foreground">含子任务 · 按当前负责人统计</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">逾期未完成</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-status-rejected">
            {overdue}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">截止日期已过且尚未验收</p>
        </Card>
      </div>

      <section className="space-y-4" aria-labelledby="contribution-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="contribution-heading" className="text-base font-semibold">
              {isReviewer ? "成员完成情况" : "我的完成情况"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              按当前负责人统计；点击成员查看任务明细
            </p>
          </div>
          {isReviewer ? (
            <p className="text-xs text-muted-foreground">
              {contribution.length} 名成员 · {total} 项任务
            </p>
          ) : null}
        </div>

        {contribution.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm font-medium">暂无成员任务数据</p>
            <p className="mt-1 text-xs text-muted-foreground">
              任务分配给成员后，这里会显示完成情况。
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {contribution.map((member) => {
              const memberRate = member.tasksTotal
                ? Math.round(member.completionRatio * 100)
                : null;

              return (
                <details
                  key={member.userId}
                  className="group overflow-hidden rounded-xl border border-border bg-card"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition-colors [transition-duration:120ms] hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                    <UserAvatar name={member.userName || "未命名成员"} className="h-9 w-9" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{member.userName || "未命名成员"}</span>
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="font-display text-base font-semibold tabular-nums">
                            {memberRate === null ? "—" : `${memberRate}%`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            已验收 {member.tasksAccepted} / {member.tasksTotal}
                          </span>
                        </span>
                      </span>
                      <span
                        className="mt-3 flex h-4 overflow-hidden rounded-full bg-border"
                        role="img"
                        aria-label={
                          memberRate === null
                            ? `${member.userName || "未命名成员"}尚未负责任务`
                            : `${member.userName || "未命名成员"}完成率 ${memberRate}%，已验收 ${member.tasksAccepted} / ${member.tasksTotal} 项`
                        }
                      >
                        {memberRate !== null && memberRate > 0 ? (
                          <span
                            className="h-full rounded-full bg-foreground/60"
                            style={{ width: `${member.completionRatio * 100}%` }}
                          />
                        ) : null}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {TASK_STATUSES.filter(
                          (status) => member.statusCounts[status] > 0,
                        ).map((status) => (
                          <span key={status} className="inline-flex items-center gap-1 whitespace-nowrap">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`}
                              aria-hidden="true"
                            />
                            {STATUS_LABELS[status]}
                            <span className="tabular-nums text-foreground">
                              {member.statusCounts[status]}
                            </span>
                          </span>
                        ))}
                        {member.tasksTotal === 0 ? <span>尚未负责任务</span> : null}
                        {member.overdue > 0 ? (
                          <span className="inline-flex items-center gap-1 text-status-rejected">
                            逾期
                            <span className="tabular-nums">{member.overdue}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronDown
                      className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>

                  {member.tasks.length === 0 ? (
                    <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
                      尚未负责任务
                    </p>
                  ) : (
                    <ul className="divide-y divide-border border-t border-border">
                      {member.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1 basis-48">
                            <Link
                              href={`/p/${projectId}/tasks/${task.id}`}
                              className="break-words text-sm font-medium hover:text-brand"
                            >
                              {task.title}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.parentTaskId ? "子任务 · " : "顶层任务 · "}
                              {task.dueDate ? `截止 ${task.dueDate}` : "未设截止日期"}
                              {task.status !== "accepted" && isOverdue(task.dueDate)
                                ? " · 已逾期"
                                : ""}
                            </p>
                          </div>
                          <StatusPill status={task.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          完成率 = 已验收任务 ÷ 负责任务；未设置截止日期的任务不计入逾期。
        </p>
      </section>
    </main>
  );
}

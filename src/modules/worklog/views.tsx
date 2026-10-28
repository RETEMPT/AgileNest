import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, getProjectForUser, isOverdue } from "@/modules/core";
import { listProjectTasks, TASK_STATUSES, STATUS_LABELS } from "@/modules/tasks";
import { memberContribution, projectCompletion } from "@/modules/worklog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";

export { ProgressView } from "./progress-view";

export async function StatsView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const [completion, contribution, topLevelTasks] = await Promise.all([
    projectCompletion(user.id, projectId),
    memberContribution(user.id, projectId),
    listProjectTasks(user.id, projectId, { parentTaskId: null }),
  ]);
  const total = contribution.reduce((sum, member) => sum + member.tasksTotal, 0);
  const overdue = contribution.reduce((sum, member) => sum + member.overdue, 0);
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">任务贡献</h1>
          <p className="mt-2 text-sm text-muted-foreground">{access.project.name} · {access.capabilities.review ? "全体成员" : "我的任务"}</p>
        </div>
        <Link href={`/p/${projectId}/table`} className="text-sm text-brand hover:underline">查看项目任务 →</Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle>项目完成度</CardTitle></CardHeader><CardContent>
          <p className="font-display text-3xl font-semibold">{completion.total ? `${Math.round(completion.ratio * 100)}%` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">已验收 {completion.done} / {completion.total} 项顶层任务</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{access.capabilities.review ? "成员负责任务" : "我负责任务"}</CardTitle></CardHeader><CardContent>
          <p className="font-display text-3xl font-semibold">{total}</p>
          <p className="mt-1 text-xs text-muted-foreground">包含子任务 · 当前负责人</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>逾期未完成</CardTitle></CardHeader><CardContent>
          <p className="font-display text-3xl font-semibold">{overdue}</p>
          <p className="mt-1 text-xs text-muted-foreground">截止日期已过且尚未验收通过</p>
        </CardContent></Card>
      </div>
      <section className="space-y-3" aria-labelledby="contribution-heading">
        <h2 id="contribution-heading" className="text-base font-semibold">{access.capabilities.review ? "成员完成情况" : "我的完成情况"}</h2>
        {contribution.length === 0 && <p className="py-6 text-sm text-muted-foreground">暂无成员任务数据</p>}
        {contribution.map((member) => (
          <details key={member.userId} className="group overflow-hidden rounded-xl border border-border bg-card">
            <summary className="cursor-pointer px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
              <span className="ml-2 font-medium">{member.userName || "未命名成员"}</span>
              <span className="ml-3 text-sm text-muted-foreground">负责 {member.tasksTotal} · 已完成 {member.tasksAccepted} · 完成率 {member.tasksTotal ? `${Math.round(member.completionRatio * 100)}%` : "—"}{member.overdue > 0 ? ` · 逾期 ${member.overdue}` : ""}</span>
              <span className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {TASK_STATUSES.map((status) => <span key={status}>{STATUS_LABELS[status]} {member.statusCounts[status]}</span>)}
              </span>
            </summary>
            {member.tasks.length === 0 ? <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground">尚未负责任务</p> : (
              <ul className="divide-y divide-border border-t border-border">
                {member.tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <Link href={`/p/${projectId}/tasks/${task.id}`} className="break-words text-sm font-medium hover:text-brand">{task.title}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">{task.parentTaskId ? "子任务 · " : ""}{task.dueDate ? `截止 ${task.dueDate}` : "未设截止日期"}{task.status !== "accepted" && isOverdue(task.dueDate) ? " · 已逾期" : ""}</p>
                    </div>
                    <StatusPill status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="stats-delivery-heading">
        <h2 id="stats-delivery-heading" className="border-b border-border px-4 py-3 text-sm font-semibold">项目顶层任务</h2>
        {topLevelTasks.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">暂无顶层任务</p> : (
          <ul className="divide-y divide-border">
            {topLevelTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/p/${projectId}/tasks/${task.id}`} className="break-words text-sm font-medium hover:text-brand">{task.title}</Link>
                  <p className="mt-1 text-xs text-muted-foreground">{task.assigneeName || "未认领"}{task.dueDate ? ` · 截止 ${task.dueDate}` : ""}</p>
                </div>
                <StatusPill status={task.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, getProjectForUser } from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import {
  memberContribution,
  projectCompletion,
  taskHours,
} from "@/modules/worklog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";

function fmtMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h ? `${h} 小时${min ? ` ${min} 分钟` : ""}` : `${min} 分钟`;
}

export async function StatsView({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const [completion, hours, contrib, topLevelTasks] = await Promise.all([
    projectCompletion(user.id, projectId),
    taskHours(user.id, projectId),
    memberContribution(user.id, projectId),
    listProjectTasks(user.id, projectId, { parentTaskId: null }),
  ]);

  const totalMinutes = hours.reduce((s, h) => s + h.minutes, 0);
  const pct = Math.round(completion.ratio * 100);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">工时与贡献</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {access.project.name} · 以验收结果统计完成度，以实际记录统计投入。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>项目完成度</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">{completion.total ? `${pct}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {completion.total ? `已验收 ${completion.done} / 共 ${completion.total} 项顶层任务` : "暂无顶层任务，尚无完成度"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>总工时</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">
              {fmtMinutes(totalMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalMinutes} 分钟 · {hours.length} 位成员有记录
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>团队成员</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">
              {contrib.length}
            </p>
            <p className="text-xs text-muted-foreground">当前项目所属团队的成员范围</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>成员工时</CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">项目全部任务的实际记录，包含子任务；条形表示已登记工时占比。</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {hours.length === 0 && (
              <p className="text-muted-foreground">暂无工时记录</p>
            )}
            {hours.map((h) => (
              <div key={h.userId} className="space-y-2 py-2">
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="break-words">{h.userName ?? "已离开的成员"}</span>
                  <span className="tabular-nums">{fmtMinutes(h.minutes)} · {h.minutes} 分钟</span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${totalMinutes ? (h.minutes / totalMinutes) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>成员交付记录</CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">按当前负责人统计全部任务，包含子任务；曾提交指有提交日期的任务数，重交不重复累计。</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contrib.length === 0 && (
              <p className="text-muted-foreground">暂无团队成员</p>
            )}
            {contrib.map((c) => (
              <div
                key={c.userId}
                className="flex flex-wrap justify-between gap-2"
              >
                <span className="break-words">{c.userName ?? "已离开的成员"}</span>
                <span className="tabular-nums text-muted-foreground">
                  已验收 {c.tasksAccepted} · 曾提交 {c.tasksSubmitted} ·{" "}
                  {fmtMinutes(c.minutes)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="stats-delivery-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 id="stats-delivery-heading" className="text-sm font-semibold">完成度对应的顶层任务</h2>
            <p className="mt-1 text-xs text-muted-foreground">子任务不重复计入分母；打开任务可查看子任务、完成说明及工时记录。</p>
          </div>
          <Link href={`/p/${projectId}/table`} className="text-sm text-brand hover:underline">查看全部任务 →</Link>
        </div>
        {topLevelTasks.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">暂无顶层任务，可进入项目任务开始分工。</p>
        ) : (
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

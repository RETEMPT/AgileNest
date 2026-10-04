import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import {
  memberContribution,
  projectCompletion,
  taskHours,
} from "@/modules/worklog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h ? `${h}h ${min}m` : `${min}m`;
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

  const [completion, hours, contrib] = await Promise.all([
    projectCompletion(user.id, projectId),
    taskHours(user.id, projectId),
    memberContribution(user.id, projectId),
  ]);

  const totalMinutes = hours.reduce((s, h) => s + h.minutes, 0);
  const pct = Math.round(completion.ratio * 100);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">工时与贡献</h1>
        <p className="text-sm text-muted-foreground">
          {access.project.name} · 以验收结果统计完成度，以实际记录统计投入。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>项目完成度</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">{pct}%</p>
            <p className="text-xs text-muted-foreground">
              {completion.done}/{completion.total} 顶层任务已验收
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
              {hours.length} 人参与
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>贡献成员</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">
              {contrib.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>成员工时</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {hours.length === 0 && (
              <p className="text-muted-foreground">暂无工时记录</p>
            )}
            {hours.map((h) => (
              <div key={h.userId} className="space-y-2 py-2">
                <div className="flex justify-between gap-3">
                  <span>{h.userName ?? "已离开的成员"}</span>
                  <span className="tabular-nums">{fmtMinutes(h.minutes)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
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
            <CardTitle>完成贡献</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contrib.length === 0 && (
              <p className="text-muted-foreground">暂无</p>
            )}
            {contrib.map((c) => (
              <div
                key={c.userId}
                className="flex flex-wrap justify-between gap-2"
              >
                <span>{c.userName ?? "已离开的成员"}</span>
                <span className="tabular-nums text-muted-foreground">
                  已完成 {c.tasksAccepted} · 提交 {c.tasksSubmitted} ·{" "}
                  {fmtMinutes(c.minutes)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

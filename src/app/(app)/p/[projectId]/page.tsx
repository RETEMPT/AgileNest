import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listProjectTasks } from "@/modules/tasks";
import { projectCompletion } from "@/modules/worklog";
import { listMilestones } from "@/modules/milestone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const p = access.project;

  const [tasks, completion, milestones] = await Promise.all([
    listProjectTasks(user.id, projectId, { parentTaskId: null }),
    projectCompletion(user.id, projectId),
    listMilestones(user.id, projectId),
  ]);

  const byStatus = {
    unclaimed: tasks.filter((t) => t.status === "unclaimed").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    submitted: tasks.filter((t) => t.status === "submitted").length,
    accepted: tasks.filter((t) => t.status === "accepted").length,
    rejected: tasks.filter((t) => t.status === "rejected").length,
  };
  const pct = Math.round(completion.ratio * 100);

  const links = [
    { href: "tasks", label: "任务池", desc: "创建 / 认领 / 指派" },
    { href: "board", label: "看板", desc: "五列流水线" },
    { href: access.role === "student" ? "tasks" : "review", label: access.role === "student" ? "任务池" : "验收台", desc: access.role === "student" ? "推进状态" : "通过 / 打回" },
  ];

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">{p.description ?? "暂无描述"}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>完成度</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">{pct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>任务</CardTitle>
            <CardDescription>
              待认领 {byStatus.unclaimed} · 进行 {byStatus.in_progress} · 待验收{" "}
              {byStatus.submitted}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            已完成 {byStatus.accepted} · 待修改 {byStatus.rejected} · 共 {tasks.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>里程碑</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {milestones.length === 0 ? (
              <p className="text-muted-foreground">未设置</p>
            ) : (
              <ul className="space-y-1">
                {milestones.slice(0, 4).map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>{m.title}</span>
                    <span className="text-muted-foreground">{m.targetDate ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {links.map((c) => (
          <Link key={c.href + c.label} href={`/p/${projectId}/${c.href}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{c.label}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>主循环</CardTitle>
          <CardDescription>认领 → 做事（子任务 / 工时）→ 提交 → 验收通过 / 打回待修改</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          五态：待认领 · 进行中 · 待验收 · 已完成 · 待修改。状态机见{" "}
          <code className="rounded bg-muted px-1">src/modules/tasks/states.ts</code>。
        </CardContent>
      </Card>
    </main>
  );
}

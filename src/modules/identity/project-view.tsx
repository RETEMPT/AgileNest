import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import { projectCompletion } from "@/modules/worklog";
import { listMilestones } from "@/modules/milestone";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TaskWorkflow } from "@/modules/tasks/ui";
import { POSITION_META } from "./client";
import { ProjectSettingsForm } from "./academic-ui";
import { Badge } from "@/components/ui/badge";

export async function ProjectOverviewView({
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
    {
      href: "board",
      label: "可视化看板",
      desc: "拖动推进状态，查看下一步操作",
    },
    { href: "tasks", label: "任务池", desc: "创建任务、认领与指派" },
    {
      href: !access.capabilities.review
        ? "table?assigneeId=" + user.id
        : "review",
      label: !access.capabilities.review ? "我的任务" : "验收台",
      desc: !access.capabilities.review
        ? "集中查看自己的任务与截止日期"
        : "查看成果，通过或提出修改意见",
    },
  ];

  return (
    <main className="space-y-6">
      <header>
        <Link
          href={`/t/${p.teamId}/projects`}
          className="text-xs text-muted-foreground hover:text-brand"
        >
          ← 团队项目
        </Link>
        <h1 className="font-display text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">
          {p.description ?? "暂无描述"}
        </p>
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
            已完成 {byStatus.accepted} · 待修改 {byStatus.rejected} · 共{" "}
            {tasks.length}
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
                    <span className="text-muted-foreground">
                      {m.targetDate ?? "—"}
                    </span>
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

      <TaskWorkflow />
    </main>
  );
}

export async function ProjectSettingsView({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const project = access.project;
  const labels = { course: "课程协作", lab: "实验室课题", contest: "竞赛战队" };
  return (
    <main className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/t/${project.teamId}/projects`}
          className="text-xs text-muted-foreground hover:text-brand"
        >
          ← 团队项目
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">项目设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {project.name} · {project.kind ? labels[project.kind] : "团队项目"}
        </p>
      </header>
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold">我在这个项目的分工</h2>
        <div className="flex flex-wrap gap-2">
          {access.positions.map((position) => (
            <Badge key={position} variant="secondary">
              {POSITION_META[position].label}
            </Badge>
          ))}
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            ["维护项目", access.capabilities.manageProject],
            ["指派任务", access.capabilities.task.actions.includes("assign")],
            ["执行任务", access.capabilities.execute],
            ["成果验收", access.capabilities.review],
          ].map(([label, allowed]) => (
            <div
              key={String(label)}
              className="flex items-center justify-between rounded-lg bg-muted p-3"
            >
              <span>{label}</span>
              <span
                className={allowed ? "text-brand" : "text-muted-foreground"}
              >
                {allowed ? "可操作" : "由其他职务负责"}
              </span>
            </div>
          ))}
        </div>
      </section>
      {access.capabilities.manageProject ? (
        <ProjectSettingsForm key={project.id} project={project} />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 text-sm">
          <h2 className="font-semibold">项目目标</h2>
          <p className="mt-2 whitespace-pre-wrap">
            {project.description || "尚未填写项目目标"}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            起止：{project.startDate || "未设置"} →{" "}
            {project.endDate || "未设置"} ·{" "}
            {project.status === "active" ? "进行中" : "已归档"}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            项目设置由管理员维护，实验室与竞赛项目也可由队长维护。
          </p>
        </section>
      )}
    </main>
  );
}

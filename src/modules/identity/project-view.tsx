import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireUser,
  getProjectForUser,
  todayISO,
  isOverdue,
} from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import { projectCompletion } from "@/modules/worklog";
import { listMilestones } from "@/modules/milestone";

import { POSITION_META } from "./client";
import { ProjectSettingsForm } from "./academic-ui";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

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
  const pct = Math.round(completion.ratio * 100);
  const today = todayISO();
  const risks = tasks
    .filter(
      (t) =>
        t.status !== "accepted" &&
        (isOverdue(t.dueDate, today) || t.status === "rejected"),
    )
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const upcoming = milestones
    .filter((m) => m.status !== "done")
    .sort((a, b) =>
      (a.targetDate || "9999").localeCompare(b.targetDate || "9999"),
    );
  const states = [
    { key: "unclaimed", label: "待认领", color: "bg-status-unclaimed" },
    { key: "in_progress", label: "进行中", color: "bg-status-in-progress" },
    { key: "submitted", label: "待验收", color: "bg-status-submitted" },
    { key: "rejected", label: "待修改", color: "bg-status-rejected" },
    { key: "accepted", label: "已完成", color: "bg-status-accepted" },
  ] as const;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={"/t/" + p.teamId + "/projects"}
            className="text-xs text-muted-foreground hover:text-brand"
          >
            ← 团队项目
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="break-words text-3xl font-semibold">{p.name}</h1>
            <Badge variant="secondary">
              {p.kind === "lab"
                ? "实验室课题"
                : p.kind === "contest"
                  ? "竞赛项目"
                  : "课程协作"}
            </Badge>
            {p.status === "archived" && (
              <Badge variant="secondary">已归档</Badge>
            )}
          </div>
          <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {p.description || "未填写项目说明"}
          </p>
        </div>
        <Button asChild>
          <Link href={"/p/" + projectId + "/tasks"}>
            进入任务池 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
          <div>
            <p className="text-sm text-muted-foreground">项目验收完成率</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight text-brand">
              {pct}
              <span className="text-xl">%</span>
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {completion.done} / {completion.total} 个顶层任务已验收
              <br />
              子任务进度在任务详情单独展示
            </p>
          </div>
          <div className="space-y-5">
            <div
              className="flex h-3 overflow-hidden rounded-full bg-muted"
              aria-label={"已验收 " + pct + "%"}
            >
              {states.map(({ key, color }) => {
                const count = tasks.filter((t) => t.status === key).length;
                return count ? (
                  <span
                    key={key}
                    className={color}
                    style={{ width: (count / tasks.length) * 100 + "%" }}
                  />
                ) : null;
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {states.map(({ key, label, color }) => (
                <Link
                  key={key}
                  href={"/p/" + projectId + "/table?status=" + key}
                  className="rounded-xl p-3 transition hover:bg-muted"
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={"h-2 w-2 rounded-full " + color} />
                    {label}
                  </span>
                  <span className="mt-2 block text-2xl font-semibold tabular-nums">
                    {tasks.filter((t) => t.status === key).length}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <nav
          aria-label="项目快捷操作"
          className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border bg-muted/30 px-5 py-4 text-sm sm:px-6"
        >
          <Link
            href={"/p/" + projectId + "/board"}
            className="font-medium text-brand"
          >
            查看看板 ↗
          </Link>
          <Link
            href={"/p/" + projectId + "/table?assigneeId=" + user.id}
            className="text-brand"
          >
            我的任务 ↗
          </Link>
          {access.capabilities.review && (
            <Link href={"/p/" + projectId + "/review"} className="text-brand">
              验收成果 ↗
            </Link>
          )}
          <Link href={"/t/" + p.teamId + "/members"} className="text-brand">
            成员与分工 ↗
          </Link>
          <Link href={"/p/" + projectId + "/stats"} className="text-brand">
            工时与贡献 ↗
          </Link>
        </nav>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-semibold">需要关注</h2>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">
              {risks.length} 项
            </span>
          </div>
          {risks.length ? (
            <ul className="divide-y divide-border">
              {risks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <Link
                    href={"/p/" + projectId + "/tasks/" + task.id}
                    className="flex items-center justify-between gap-3 p-5 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {task.title}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {task.assigneeName || "待安排负责人"}
                        {task.dueDate ? " · 截止 " + task.dueDate : ""}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <StatusPill status={task.status} />
                      {isOverdue(task.dueDate, today) && (
                        <p className="text-xs text-destructive">已逾期</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-brand/50" />
              <p className="text-sm font-medium">暂无待关注事项</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tasks.length
                  ? "当前没有逾期或待修改任务。"
                  : "项目还没有任务，可到任务池创建。"}
              </p>
            </div>
          )}
        </section>
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-semibold">近期里程碑</h2>
            <Link
              href={"/p/" + projectId + "/milestones"}
              className="text-xs text-brand"
            >
              全部 →
            </Link>
          </div>
          {upcoming.length ? (
            <ol className="space-y-5 p-5">
              {upcoming.slice(0, 5).map((m) => (
                <li key={m.id} className="flex gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={"/p/" + projectId + "/table?milestoneId=" + m.id}
                      className="text-sm font-medium hover:text-brand"
                    >
                      {m.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.targetDate || "尚未排期"} · 点击查看关联任务
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              暂无待完成的里程碑。可在里程碑页面安排阶段目标。
            </p>
          )}
          <div className="border-t border-border bg-muted/30 p-5 text-xs text-muted-foreground">
            项目周期：{p.startDate || "未设开始"} → {p.endDate || "未设结束"}
          </div>
        </section>
      </div>
    </div>
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

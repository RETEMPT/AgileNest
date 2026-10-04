import Link from "next/link";
import {
  ArrowUpRight,
  CheckCheck,
  Inbox,
  ListTodo,
  UsersRound,
} from "lucide-react";
import { requireUser, isOverdue, todayISO } from "@/modules/core";
import { getAccountProfile, listMyProjects } from "@/modules/identity";
import { TaskActions } from "@/modules/tasks/ui";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getWorkbench } from "./service";

export async function WorkbenchView({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const [work, profile, projects, query] = await Promise.all([
    getWorkbench(user.id),
    getAccountProfile(user.id),
    listMyProjects(user.id),
    searchParams,
  ]);
  const view =
    query.view === "review" || query.view === "pool" ? query.view : "mine";
  const tabs = [
    { key: "mine", title: "我负责的", count: work.mine.length, icon: ListTodo },
    {
      key: "review",
      title: "待我验收",
      count: work.review.length,
      icon: CheckCheck,
    },
    { key: "pool", title: "可以认领", count: work.pool.length, icon: Inbox },
  ];
  const items = work[view];
  const overdue = work.mine.filter((task) =>
    isOverdue(task.dueDate, todayISO()),
  ).length;
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand">
            WORKSPACE / 工作台
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {profile.name}，从这里开始
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            自己的任务、团队的交付，在一个地方接着推进。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/t">
            <UsersRound className="h-4 w-4" />
            团队空间
          </Link>
        </Button>
      </header>
      <div className="grid gap-0 overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-3">
        {tabs.map(({ key, title, count, icon: Icon }) => (
          <Link
            key={key}
            href={`/home?view=${key}`}
            className="group flex items-center justify-between border-b border-border p-5 transition hover:bg-brand-soft sm:border-b-0 sm:border-r last:border-0"
          >
            <div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-brand" />
                {title}
              </p>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {count}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  项
                </span>
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-brand" />
          </Link>
        ))}
      </div>
      {overdue > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          你有 {overdue} 项任务已过截止日期，请优先更新进展或协调排期。
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <nav
            aria-label="工作台任务分类"
            className="flex overflow-x-auto border-b border-border px-3"
          >
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/home?view=${tab.key}`}
                aria-current={view === tab.key ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium ${view === tab.key ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab.title}
                <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  {tab.count}
                </span>
              </Link>
            ))}
          </nav>
          {items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Inbox className="mx-auto mb-4 h-9 w-9 text-brand/40" />
              <h2 className="font-medium">
                {view === "mine"
                  ? "还没有待办任务"
                  : view === "review"
                    ? "暂无需要你验收的成果"
                    : "任务池暂时没有可认领任务"}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {view === "mine"
                  ? "到任务池认领一项工作，或请队长安排分工。"
                  : view === "review"
                    ? "你在某个项目拥有管理员或指导老师职务时，待验收成果会出现在这里。"
                    : "进入团队项目创建任务，一起明确下一步目标。"}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5">
                <Link href={view === "mine" ? "/home?view=pool" : "/t"}>
                  {view === "mine" ? "查看可认领任务" : "进入团队空间"}
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((task) => (
                <li
                  key={task.id}
                  className="space-y-3 p-4 transition hover:bg-muted/25 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/p/${task.projectId}/tasks/${task.id}`}
                        className="break-words font-medium hover:text-brand"
                      >
                        {task.title}
                      </Link>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <Link
                          href={`/p/${task.projectId}`}
                          className="hover:text-brand"
                        >
                          {task.projectName}
                        </Link>{" "}
                        · {task.assigneeName || "等待认领"}
                        {task.parentTaskId ? " · 子任务" : ""}
                      </p>
                    </div>
                    <StatusPill status={task.status} />
                  </div>
                  {view === "review" && task.completionNote && (
                    <p className="line-clamp-3 whitespace-pre-wrap rounded-lg bg-brand-soft p-3 text-sm leading-6 text-brand">
                      {task.completionNote}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PriorityPill priority={task.priority} />
                      <span
                        className={`text-xs ${isOverdue(task.dueDate, todayISO()) ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {task.dueDate ? `截止 ${task.dueDate}` : "未设截止日期"}
                      </span>
                    </div>
                    <TaskActions
                      task={task}
                      role={task.role}
                      actorId={user.id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="space-y-5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">我的项目</h2>
              <Link href="/t" className="text-xs text-brand">
                查看团队 →
              </Link>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {projects.slice(0, 8).map((project) => (
                <Link
                  key={project.id}
                  href={`/p/${project.id}`}
                  className="flex items-center justify-between gap-3 p-3.5 hover:bg-brand-soft"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {project.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {project.teamName}
                      {project.status === "archived" ? " · 已归档" : ""}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
              {projects.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  加入或创建团队后，从项目开始协作。
                </p>
              )}
            </div>
          </section>
          <Link
            href="/notifications"
            className="block rounded-xl bg-brand-soft p-4"
          >
            <span className="text-sm font-semibold text-brand">消息中心 ↗</span>
            <p className="mt-2 text-xs leading-5 text-brand/80">
              查看任务指派、提交与验收结果。
            </p>
          </Link>
        </aside>
      </div>
    </div>
  );
}

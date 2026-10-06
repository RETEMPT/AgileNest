import Link from "next/link";
import {
  ArrowUpRight,
  CheckCheck,
  Inbox,
  ListTodo,
  UsersRound,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { requireUser, isOverdue, todayISO } from "@/modules/core";
import { listMyProjects } from "@/modules/identity";
import { TaskActions } from "@/modules/tasks/ui";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { getWorkbench } from "./service";
import {
  parseWorkbenchQuery,
  selectWorkbenchItems,
  workbenchUrl,
  type WorkbenchSearchParams,
} from "./client";

export async function WorkbenchView({
  searchParams,
}: {
  searchParams: Promise<WorkbenchSearchParams>;
}) {
  const user = await requireUser();
  const [work, projects, params] = await Promise.all([
    getWorkbench(user.id),
    listMyProjects(user.id),
    searchParams,
  ]);
  const query = parseWorkbenchQuery(params);
  const { view } = query;
  const today = todayISO();
  const tabs = [
    { key: "mine", title: "我负责的", count: work.mine.length, icon: ListTodo },
    {
      key: "review",
      title: "待我验收",
      count: work.review.length,
      icon: CheckCheck,
    },
    { key: "pool", title: "可以认领", count: work.pool.length, icon: Inbox },
  ] as const;
  const items = selectWorkbenchItems(work[view], query, today);
  const filtered = Boolean(query.q || query.projectId || query.due !== "all");
  const resetUrl = workbenchUrl(query, { q: "", projectId: "", due: "all" });
  const overdue = work.mine.filter((task) => isOverdue(task.dueDate, today)).length;
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">工作台</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            跨项目查看负责、待验收和可认领的任务。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/t">
            <UsersRound className="h-4 w-4" />
            团队空间
          </Link>
        </Button>
      </header>
      <nav aria-label="工作台任务分类" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tabs.map(({ key, title, count, icon: Icon }) => (
          <Link
            key={key}
            href={workbenchUrl(query, { view: key })}
            aria-current={view === key ? "page" : undefined}
            className={`group rounded-xl border p-3 transition sm:p-4 ${view === key ? "border-brand/40 bg-brand-soft ring-1 ring-brand/10" : "border-border bg-card hover:border-brand/30"}`}
          >
            <div>
              <p
                className={`flex items-center gap-1.5 text-xs font-medium sm:text-sm ${view === key ? "text-brand" : "text-muted-foreground"}`}
              >
                <Icon className="hidden h-4 w-4 sm:block" />
                {title}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {count}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  项
                </span>
              </p>
            </div>
          </Link>
        ))}
      </nav>
      {overdue > 0 && (
        <Link
          href={workbenchUrl(query, { view: "mine", due: "overdue", q: "", projectId: "" })}
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>我负责的任务中有 {overdue} 项已逾期</span>
          <span className="shrink-0 text-xs font-medium">查看任务 →</span>
        </Link>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <form
            action="/home"
            method="get"
            aria-label="筛选工作台任务"
            className="grid gap-3 border-b border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5"
          >
            <input type="hidden" name="view" value={view} />
            <div className="sm:col-span-2">
              <Label htmlFor="workbench-q" className="sr-only">
                搜索任务
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  key={query.q}
                  id="workbench-q"
                  name="q"
                  defaultValue={query.q}
                  maxLength={200}
                  placeholder="搜索任务名称、描述或项目"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="workbench-project">项目</Label>
              <Select
                key={query.projectId}
                id="workbench-project"
                name="projectId"
                defaultValue={query.projectId}
              >
                <option value="">全部项目</option>
                {query.projectId &&
                  !projects.some((project) => project.id === query.projectId && project.status !== "archived") && (
                    <option value={query.projectId}>所选项目已归档或不可访问</option>
                  )}
                {projects.filter((project) => project.status !== "archived").map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.teamName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workbench-due">截止日期</Label>
              <Select
                key={query.due}
                id="workbench-due"
                name="due"
                defaultValue={query.due}
              >
                <option value="all">全部日期</option>
                <option value="overdue">已逾期</option>
                <option value="soon">7 天内到期（含今天）</option>
              </Select>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="outline" size="sm">
                <SlidersHorizontal className="h-3.5 w-3.5" />筛选
              </Button>
              {filtered && (
                <Link href={resetUrl} className="text-xs text-muted-foreground hover:text-brand">
                  清除筛选
                </Link>
              )}
            </div>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">
              {tabs.find((tab) => tab.key === view)?.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {items.length} 项{filtered ? ` / 共 ${work[view].length} 项` : ""}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">逾期优先 · 优先级 · 截止日期</p>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Inbox className="mx-auto mb-4 h-9 w-9 text-brand/40" />
              <h2 className="font-medium">
                {filtered ? "没有符合筛选条件的任务" : view === "mine"
                  ? "暂无负责的任务"
                  : view === "review"
                    ? "暂无待验收任务"
                    : "暂无可认领任务"}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {filtered ? "调整关键词、项目或截止日期后重试。" : view === "mine"
                  ? "可到任务池认领，或由有指派权限的成员分配任务。"
                  : view === "review"
                    ? "仅显示当前职务允许验收的项目任务。"
                    : "可进入团队项目查看或创建任务。"}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5">
                <Link href={filtered ? resetUrl : view === "mine" ? "/home?view=pool" : "/t"}>
                  {filtered ? "清除筛选" : view === "mine" ? "查看可认领任务" : "进入团队空间"}
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
                        className={`text-xs ${isOverdue(task.dueDate, today) ? "text-destructive" : "text-muted-foreground"}`}
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
                  暂无项目，可在团队空间创建或加入团队。
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

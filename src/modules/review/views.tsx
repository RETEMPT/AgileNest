import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CheckCheck,
  Inbox,
  ListTodo,
  UsersRound,
  Search,
  SlidersHorizontal,
  AlarmClock,
  CalendarDays,
  RotateCcw,
  X,
} from "lucide-react";
import { requireUser, isOverdue, todayISO, getProjectForUser } from "@/modules/core";
import { listMyProjects } from "@/modules/identity";
import { listProjectTasks } from "@/modules/tasks";
import { TaskActions } from "@/modules/tasks/ui";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { getWorkbench, listPendingReview, listOverdueRisks } from "./service";
import { ReviewTaskDetails, ReviewSubmissionEvidence } from "./ui";
import {
  parseWorkbenchQuery,
  selectWorkbenchItems,
  paginateWorkbenchItems,
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
  const page = paginateWorkbenchItems(items, query.page);
  const filtered = Boolean(query.q || query.projectId || query.due !== "all" || query.status !== "all");
  const resetUrl = workbenchUrl(query, { q: "", projectId: "", due: "all", status: "all" });
  const dueLabels = { all: "全部日期", overdue: "已逾期", today: "今天到期", soon: "7 天内到期（含今天）", undated: "未设截止日期" };
  const statusLabels = { all: "全部状态", unclaimed: "待认领", in_progress: "进行中", rejected: "需修改", submitted: "待验收" };
  const sortLabels = { smart: "逾期优先 · 优先级 · 截止日期", due: "截止日期从近到远 · 未设日期置后", updated: "最近更新优先" };
  const quickViews = [
    { label: "今天到期", description: "我负责的任务", icon: CalendarDays, query: parseWorkbenchQuery({ due: "today" }) },
    { label: "已逾期", description: "我负责的任务", icon: AlarmClock, query: parseWorkbenchQuery({ due: "overdue" }) },
    { label: "需修改", description: "查看打回意见并重交", icon: RotateCcw, query: parseWorkbenchQuery({ status: "rejected" }) },
    { label: "待我验收", description: "核对成果与验收要求", icon: CheckCheck, query: parseWorkbenchQuery({ view: "review" }) },
  ];
  const activeFilters = [
    ...(query.q ? [{ label: `关键词：${query.q}`, href: workbenchUrl(query, { q: "" }) }] : []),
    ...(query.projectId ? [{ label: `项目：${projects.find((project) => project.id === query.projectId)?.name ?? "已归档或不可访问"}`, href: workbenchUrl(query, { projectId: "" }) }] : []),
    ...(query.due !== "all" ? [{ label: dueLabels[query.due], href: workbenchUrl(query, { due: "all" }) }] : []),
    ...(query.status !== "all" ? [{ label: statusLabels[query.status], href: workbenchUrl(query, { status: "all" }) }] : []),
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
          <p className="mt-2 text-sm text-muted-foreground">
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
      <section aria-labelledby="workbench-focus-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="workbench-focus-heading" className="text-sm font-semibold">待办速览</h2>
          <p className="text-xs text-muted-foreground">全部活跃项目 · <time dateTime={today}>{today}</time></p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickViews.map(({ label, description, icon: Icon, query: shortcut }) => {
            const count = selectWorkbenchItems(work[shortcut.view], shortcut, today).length;
            return <Link key={label} href={workbenchUrl(shortcut)} aria-label={`${label}，${count} 项，${description}`} className="min-w-0 rounded-xl border border-border bg-card p-4 transition hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon aria-hidden="true" className="h-4 w-4 shrink-0" /></div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">{count}<span className="ml-1.5 text-xs font-normal text-muted-foreground">项</span></p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </Link>;
          })}
        </div>
      </section>
      <nav aria-label="工作台任务分类" className="flex flex-wrap gap-2">
        {tabs.map(({ key, title, count, icon: Icon }) => (
          <Link
            key={key}
            href={workbenchUrl(query, { view: key, status: "all" })}
            aria-current={view === key ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${view === key ? "border-brand/40 bg-brand-soft font-medium text-brand" : "border-border bg-card text-muted-foreground hover:border-brand/30"}`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {title}
            <span className="rounded bg-background/70 px-1.5 py-0.5 text-xs tabular-nums">{count}</span>
          </Link>
        ))}
      </nav>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <form
            action="/home"
            method="get"
            aria-label="筛选工作台任务"
            className="grid min-w-0 gap-3 border-b border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5"
          >
            <input type="hidden" name="view" value={view} />
            <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
              <Label htmlFor="workbench-q" className="sr-only">
                搜索任务
              </Label>
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground sm:top-2.5" />
                <Input
                  key={query.q}
                  id="workbench-q"
                  name="q"
                  defaultValue={query.q}
                  maxLength={200}
                  placeholder="搜索任务名称、描述或项目"
                  className="h-11 pl-9 sm:h-9"
                />
              </div>
              <Button type="submit" variant="outline" className="h-11 sm:h-9">搜索</Button>
            </div>
            <details key={`${query.projectId}-${query.due}-${query.status}-${query.sort}`} open={Boolean(query.projectId || query.due !== "all" || query.status !== "all" || query.sort !== "smart")} className="min-w-0 sm:col-span-2">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:min-h-9 sm:py-2">项目、日期、状态与排序</summary>
              <div className="grid min-w-0 gap-3 pt-3 sm:grid-cols-2">
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
                    {Object.entries(dueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="workbench-status">任务状态</Label>
                  <Select key={`${view}-${query.status}`} id="workbench-status" name="status" defaultValue={query.status}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="workbench-sort">排序方式</Label>
                  <Select key={query.sort} id="workbench-sort" name="sort" defaultValue={query.sort}>
                    <option value="smart">智能排序（逾期与优先级）</option>
                    <option value="due">截止日期从近到远</option>
                    <option value="updated">最近更新优先</option>
                  </Select>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Button type="submit" variant="outline" className="min-h-11 sm:min-h-9">
                    <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />应用筛选
                  </Button>
                  {filtered && (
                    <Link href={resetUrl} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-brand sm:min-h-9">
                      清除筛选
                    </Link>
                  )}
                </div>
              </div>
            </details>
          </form>
          {activeFilters.length > 0 && <nav aria-label="已选筛选条件" className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
            {activeFilters.map(({ label, href }) => <Link key={href} href={href} aria-label={`清除${label}`} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg bg-brand-soft px-3 py-1.5 text-xs text-brand hover:bg-accent">
              <span className="min-w-0 break-all">{label}</span><X aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </Link>)}
          </nav>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">
              {tabs.find((tab) => tab.key === view)?.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {items.length} 项{filtered ? ` / 共 ${work[view].length} 项` : ""}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">{sortLabels[query.sort]}</p>
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
                {filtered ? "调整关键词、项目、状态或截止日期后重试。" : view === "mine"
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
              {page.items.map((task) => (
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
                  {task.status === "rejected" && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                      <p className="mb-1 font-medium text-destructive">修改意见 · 修改后重新提交</p>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words leading-6">
                        {task.rejectReason || "暂无修改意见，请打开任务查看活动记录。"}
                      </p>
                    </div>
                  )}
                  {task.status === "submitted" && (
                    <div className="rounded-lg bg-brand-soft p-3 text-sm">
                      <p className="mb-1 font-medium text-brand">{view === "review" ? "最新完成说明" : "已提交，等待验收"}</p>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words leading-6">
                        {task.completionNote || "暂无完成说明，请打开任务查看活动记录。"}
                      </p>
                    </div>
                  )}
                  {view === "review" && <ReviewSubmissionEvidence taskId={task.id} updatedAt={task.updatedAt.toISOString()} />}
                  {task.blocked && (
                    <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
                      前置依赖尚未验收完成。可以准备资料或处理修改，完成依赖后再提交或验收；具体依赖可在任务详情中查看。
                    </p>
                  )}
                  {view === "review" && task.acceptBlocked && (
                    <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
                      子任务尚未全部验收通过。可先核对当前成果或打回修改，全部子任务通过后再验收父任务。
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
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
          {items.length > 0 && <nav aria-label="工作台任务分页" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
            <p className="text-xs text-muted-foreground">第 {page.start}–{page.end} 项，共 {items.length} 项 · 第 {page.page}/{page.totalPages} 页</p>
            {page.totalPages > 1 && <div className="flex items-center gap-2">
              {page.page > 1 ? <Button asChild variant="outline"><Link href={workbenchUrl(query, { page: page.page - 1 })}>上一页</Link></Button> : <Button variant="outline" disabled>上一页</Button>}
              {page.page < page.totalPages ? <Button asChild variant="outline"><Link href={workbenchUrl(query, { page: page.page + 1 })}>下一页</Link></Button> : <Button variant="outline" disabled>下一页</Button>}
            </div>}
          </nav>}
        </section>
        <aside className="min-w-0 space-y-5">
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

export async function ReviewView({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  if (!access.capabilities.review) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">验收台</h1>
        <div className="rounded-xl border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
          当前项目的验收由管理员、副管理员或指导老师处理。你可以在
          <Link href={`/p/${projectId}/tasks`} className="mx-1 text-brand hover:underline">
            项目任务
          </Link>
          查看提交和修改进度。
        </div>
      </main>
    );
  }

  const [pending, overdue, projectTasks] = await Promise.all([
    listPendingReview(user.id, projectId),
    listOverdueRisks(user.id, projectId),
    listProjectTasks(user.id, projectId),
  ]);
  const children = new Map<string, typeof projectTasks>();
  for (const task of projectTasks) {
    if (!task.parentTaskId) continue;
    const group = children.get(task.parentTaskId) ?? [];
    group.push(task);
    children.set(task.parentTaskId, group);
  }

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">验收台</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {access.project.name} · 待验收 {pending.length} 项 · 逾期 {overdue.length} 项
          </p>
        </div>
        <nav aria-label="任务与交付流程" className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/p/${projectId}/tasks`}>项目任务</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/p/${projectId}/delivery`}>交付清单<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></Button>
        </nav>
      </header>
      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="review-queue-heading">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 id="review-queue-heading" className="text-sm font-semibold">待验收队列</h2>
          <p className="mt-1 text-xs text-muted-foreground">先核对提交版本、成果证据与子任务，再逐项评审；每次结论对应指定提交。</p>
        </div>
        {pending.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CheckCheck aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-brand/50" />
            <h3 className="text-sm font-medium">暂无待验收任务</h3>
            <p className="mt-2 text-sm text-muted-foreground">成员提交完成说明后，任务会进入此队列。</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href={`/p/${projectId}/tasks`}>查看项目任务</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((task) => {
              const subtasks = children.get(task.id) ?? [];
              const accepted = subtasks.filter((child) => child.status === "accepted").length;
              return (
                <li key={task.id} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <Link href={`/p/${projectId}/tasks/${task.id}`} className="break-words text-sm font-semibold hover:text-brand">
                        {task.title}
                      </Link>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {task.submitterName || "负责人未设置"}{task.parentTaskId ? " · 子任务" : " · 顶层任务"}
                        {task.dueDate ? ` · 截止 ${task.dueDate}` : ""}
                      </p>
                    </div>
                    <StatusPill status={task.status} />
                  </div>
                  <div className="rounded-lg bg-brand-soft p-3">
                    <h3 className="mb-1 text-xs font-semibold text-brand">最新提交摘要</h3>
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6">{task.completionNote || "暂无完成说明，请核对提交版本记录。"}</p>
                  </div>
                  <ReviewSubmissionEvidence taskId={task.id} updatedAt={task.updatedAt.toISOString()} />
                  {(task.blocked || accepted < subtasks.length) && (
                    <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
                      {task.blocked ? "前置依赖尚未验收完成。" : ""}{accepted < subtasks.length ? `直接子任务已验收 ${accepted}/${subtasks.length}。` : ""}完成这些事项后才能通过当前任务；仍可核对成果并填写修改意见。
                    </p>
                  )}
                  {task.rejectReason && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">上次修改意见</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-destructive/30 pl-3 leading-6">{task.rejectReason}</p>
                    </details>
                  )}
                  {subtasks.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">直接子任务已验收 {accepted}/{subtasks.length}{accepted < subtasks.length ? " · 全部验收后才能通过父任务" : ""}</summary>
                      <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                        {subtasks.map((child) => (
                          <li key={child.id} className="flex flex-wrap items-center justify-between gap-2">
                            <Link href={`/p/${projectId}/tasks/${child.id}`} className="min-w-0 break-words text-brand hover:underline">{child.title}</Link>
                            <StatusPill status={child.status} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <ReviewTaskDetails task={task} role={access.role} actorId={user.id} />
                    <TaskActions task={task} role={access.role} actorId={user.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="space-y-3" aria-labelledby="review-overdue-heading">
        <h2 id="review-overdue-heading" className="text-sm font-semibold">逾期事项 · {overdue.length}</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无进行中、待验收或待修改的逾期任务。</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {overdue.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/p/${projectId}/tasks/${task.id}`} className="break-words text-sm font-medium hover:text-brand">{task.title}</Link>
                  <p className="mt-1 text-xs text-muted-foreground">{task.assigneeName || "未认领"} · 截止 {task.dueDate}</p>
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

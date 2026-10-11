import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getProjectForUser, todayISO } from "@/modules/core";
import { getTaskDetail, getTaskDelivery, listProjectTasks } from "./service";
import { listTeamMembers } from "@/modules/identity";
import { listTaskEvents } from "@/modules/review";
import { listWorklogs } from "@/modules/worklog";
import { listMilestones } from "@/modules/milestone";
import { EditTaskButton } from "./edit-ui";
import {
  DeleteTaskButton,
  TaskActions,
  WorklogForm,
  TaskWorkflow,
  TaskCard,
  CreateTaskForm,
  TaskDetailSummary,
  TaskOrganization,
} from "./ui";
import { Button } from "@/components/ui/button";
import { TaskAuditStream } from "@/components/cards/task-audit-stream";
import { SubmissionTimeline } from "@/modules/review/ui";
import { TaskRequirementsEditor } from "./requirements-ui";
import { applyFilters, parseFilters, serializeFilters, workspaceUrl, type GroupBy } from "@/modules/board/client";
import { TaskPoolFilters } from "./pool-filters";
import { SavedTaskViews } from "@/modules/board/ui";
import { TaskDiscussions } from "@/modules/discussions/ui";
import { ResourceTaskLinks } from "@/modules/resources/ui";

export async function TaskDetailView({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const task = await getTaskDetail(user.id, taskId).catch(() => null);
  if (!task || task.projectId !== projectId) notFound();

  const [events, logs, members, milestones, delivery] = await Promise.all([
    listTaskEvents(user.id, taskId),
    listWorklogs(user.id, taskId),
    listTeamMembers(user.id, access.project.teamId),
    listMilestones(user.id, projectId),
    getTaskDelivery(user.id, taskId),
  ]);

  return (
    <main className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="返回任务" className="flex flex-wrap gap-3 text-sm">
          <Link href={`/p/${projectId}/tasks`} className="text-brand hover:underline">
            ← 任务池
          </Link>
        {task.parentTaskId && (
          <Link
            href={`/p/${projectId}/tasks/${task.parentTaskId}`}
            className="inline-block text-sm text-brand hover:underline"
          >
            ↑ 返回父任务
          </Link>
        )}
        </nav>
        <div className="flex flex-wrap gap-2">
          {task.permissions?.actions.includes("update") && (
            <EditTaskButton task={task} milestones={milestones} />
          )}
          {task.permissions?.actions.includes("delete") && (
            <DeleteTaskButton taskId={task.id} projectId={projectId} />
          )}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <TaskDetailSummary
          task={task}
          subtasks={task.subtasks}
          milestoneName={milestones.find((milestone) => milestone.id === task.milestoneId)?.title}
          loggedMinutes={logs.reduce((total, log) => total + log.minutes, 0)}
          headingLevel="h1"
        />
      </section>

      <TaskOrganization taskId={task.id} projectId={projectId} />
      <ResourceTaskLinks taskId={task.id} projectId={projectId} />
      <TaskRequirementsEditor taskId={task.id} requirements={delivery.requirements} canEdit={Boolean(task.permissions?.actions.includes("update"))} />
      <TaskDiscussions taskId={task.id} projectId={projectId} actorId={user.id} />
      <SubmissionTimeline taskId={task.id} updatedAt={task.updatedAt.toISOString()} />

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">下一步操作</h2>
        <TaskActions task={task} role={access.role} actorId={user.id} members={members} />
      </section>

      {!task.parentTaskId && (
        <section aria-label="拆分子任务" className="space-y-2">
          {task.permissions?.actions.includes("create") &&
          !["submitted", "accepted"].includes(task.status) ? (
            <CreateTaskForm projectId={projectId} parentTaskId={task.id} />
          ) : ["submitted", "accepted"].includes(task.status) ? (
            <p className="rounded-lg bg-brand-soft p-3 text-xs text-brand">
              {task.status === "accepted"
                ? "当前任务已验收完成。需要继续拆分时，请先重新打开。"
                : "当前任务待验收。需要继续拆分时，请先由验收者打回。"}
            </p>
          ) : null}
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-display text-sm font-semibold">工时</h2>
        {access.capabilities.execute && task.assigneeId === user.id ? (
          <WorklogForm
            taskId={task.id}
            projectId={projectId}
            defaultDate={todayISO()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            由任务负责人记录实际投入工时。
          </p>
        )}
        {logs.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {l.workDate} · {l.minutes} 分钟{l.note ? ` · ${l.note}` : ""}
                </span>
                <span className="text-muted-foreground">{l.userName}</span>
              </li>
            ))}
          </ul>
        )}
        {logs.length === 0 && <p className="text-sm text-muted-foreground">暂无工时记录。</p>}
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">查看任务流程</summary>
        <div className="mt-4"><TaskWorkflow status={task.status} /></div>
      </details>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-foreground">
              任务活动记录
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {events.length} 条活动
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            查看操作人与流转说明
          </span>
        </div>
        <TaskAuditStream events={events} />
      </section>
    </main>
  );
}

export async function TaskPoolView({ projectId, query = {} }: { projectId: string; query?: Record<string, string | string[] | undefined> }) {
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const [tasks, members, milestones] = await Promise.all([
    listProjectTasks(user.id, projectId, { parentTaskId: null }),
    listTeamMembers(user.id, access.project.teamId),
    listMilestones(user.id, projectId),
  ]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const entry of Array.isArray(value) ? value : value ? [value] : []) params.append(key, entry);
  const filters = parseFilters(params);
  const group = params.get("groupBy");
  const groupBy: GroupBy = group === "assignee" || group === "priority" || group === "milestone" ? group : "status";
  const visible = applyFilters(tasks, filters).sort((a, b) => Number(b.status === "unclaimed") - Number(a.status === "unclaimed"));
  const hasFilters = serializeFilters(filters).size > 0;
  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">任务池</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {visible.length}/{tasks.length} 个任务 · 未认领事项优先显示
          </p>
        </div>
      </header>
      <nav aria-label="任务视图" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        <Button asChild variant="secondary" size="sm"><Link aria-current="page" href={workspaceUrl({ projectId, view: "tasks", filters, groupBy })}>任务池</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link href={workspaceUrl({ projectId, view: "board", filters, groupBy })}>看板</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link href={workspaceUrl({ projectId, view: "table", filters, groupBy })}>表格</Link></Button>
      </nav>
      <TaskPoolFilters projectId={projectId} filters={filters} members={members} milestones={milestones} groupBy={groupBy} />
      <SavedTaskViews projectId={projectId} layout="tasks" groupBy={groupBy} filters={filters} />
      <details className="rounded-xl border border-border bg-card p-4" open={tasks.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">任务流程与权限</summary>
        <div className="mt-4"><TaskWorkflow /></div>
      </details>
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              role={access.role}
              actorId={user.id}
            />
          ))}
          {tasks.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              暂无任务。创建后可由有执行职务的成员认领，或由有指派权限的成员分配。
            </p>
          )}
          {tasks.length > 0 && visible.length === 0 && <div className="space-y-3 rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"><p>没有符合当前条件的任务，可调整筛选或重置条件。</p><Button asChild variant="outline" size="sm"><Link href={`/p/${projectId}/tasks`}>重置筛选</Link></Button></div>}
        </div>
        <div className="space-y-3"><CreateTaskForm projectId={projectId} />{hasFilters && <p className="px-1 text-xs leading-relaxed text-muted-foreground">创建后当前筛选会保留；新任务可能不在筛选结果中。</p>}</div>
      </div>
    </main>
  );
}

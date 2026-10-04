import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { getTaskDetail, listProjectTasks } from "./service";
import { listTeamMembers } from "@/modules/identity";
import { listTaskEvents } from "@/modules/review";
import { listWorklogs } from "@/modules/worklog";
import { completionRatio } from "@/modules/worklog";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  DeleteTaskButton,
  DueDateForm,
  EditTaskForm,
  SubtaskForm,
  TaskActions,
  WorklogForm,
  TaskWorkflow,
  TaskCard,
  CreateTaskForm,
} from "./ui";
import { canDeleteTask } from "./states";
import { Button } from "@/components/ui/button";
import { TaskAuditStream } from "@/components/cards/task-audit-stream";

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

  const [events, logs, ratio, members] = await Promise.all([
    listTaskEvents(user.id, taskId),
    listWorklogs(user.id, taskId),
    completionRatio(user.id, taskId),
    listTeamMembers(user.id, access.project.teamId),
  ]);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/p/${projectId}/tasks`}
            className="text-primary hover:underline"
          >
            ← 任务池
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold">{task.title}</h1>
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
        </div>
        <p className="text-sm text-muted-foreground">
          负责：{task.assigneeName ?? "未认领"}
          {task.dueDate ? ` · 截止 ${task.dueDate}` : ""}
          {` · 完成度 ${ratio.done}/${ratio.total}`}
        </p>
        {task.description && (
          <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
            {task.description}
          </p>
        )}
        {task.completionNote && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <span className="font-medium">
              {task.status === "in_progress" || task.status === "unclaimed"
                ? "上次提交说明："
                : "完成说明："}
            </span>
            {task.completionNote}
          </p>
        )}
        {task.rejectReason && (
          <p
            className={`rounded-md border p-3 text-sm ${task.status === "rejected" ? "border-red-200 bg-red-50" : "border-border bg-muted text-muted-foreground"}`}
          >
            <span className="font-medium">
              {task.status === "rejected" ? "修改意见：" : "上次修改意见："}
            </span>
            {task.rejectReason}
          </p>
        )}
      </header>

      <TaskWorkflow status={task.status} />

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold">操作</h2>
        <TaskActions
          task={task}
          role={access.role}
          actorId={user.id}
          members={members}
        />
        <DueDateForm
          taskId={task.id}
          projectId={projectId}
          dueDate={task.dueDate}
        />
        {canDeleteTask(access.role) && (
          <DeleteTaskButton taskId={task.id} projectId={projectId} />
        )}
      </section>

      {task.permissions?.actions.includes("update") && (
        <section className="space-y-2">
          <EditTaskForm task={task} />
        </section>
      )}

      {(task.subtasks.length > 0 ||
        (task.permissions?.actions.includes("create") &&
          !task.parentTaskId)) && (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold">
            子任务{task.subtasks.length > 0 ? `（${task.subtasks.length}）` : ""}
          </h2>
          {task.permissions?.actions.includes("create") && !task.parentTaskId && (
            <SubtaskForm parentTaskId={task.id} />
          )}
          {task.subtasks.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {task.subtasks.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <Link
                    href={`/p/${projectId}/tasks/${s.id}`}
                    className="hover:underline"
                  >
                    {s.title}
                  </Link>
                  <StatusPill status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold">工时</h2>
        <WorklogForm taskId={task.id} projectId={projectId} />
        {logs.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex justify-between px-3 py-2">
                <span>
                  {l.workDate} · {l.minutes} 分钟{l.note ? ` · ${l.note}` : ""}
                </span>
                <span className="text-muted-foreground">{l.userName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-foreground">
              任务活动记录
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {events.length} 次流转
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

export async function TaskPoolView({ projectId }: { projectId: string }) {
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const tasks = await listProjectTasks(user.id, projectId, {
    parentTaskId: null,
  });
  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">任务池</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tasks.length} 个任务 · 认领、提交与验收形成完整协作链路
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/p/${projectId}/board`}>进入可视化看板 →</Link>
        </Button>
      </header>
      <TaskWorkflow />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              role={access.role}
              actorId={user.id}
            />
          ))}
          {tasks.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              还没有任务。创建第一个任务，之后就可以认领和指派。
            </p>
          )}
        </div>
        <CreateTaskForm projectId={projectId} />
      </div>
    </main>
  );
}

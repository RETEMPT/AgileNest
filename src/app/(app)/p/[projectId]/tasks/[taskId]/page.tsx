import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { getTaskDetail } from "@/modules/tasks";
import { listTaskEvents } from "@/modules/review";
import { listWorklogs } from "@/modules/worklog";
import { completionRatio } from "@/modules/worklog";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  DeleteTaskButton,
  DueDateForm,
  TaskActions,
  WorklogForm,
} from "@/modules/tasks/ui";
import { canDeleteTask } from "@/modules/tasks/states";
import { TaskAuditStream } from "@/components/cards/task-audit-stream";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const task = await getTaskDetail(user.id, taskId).catch(() => null);
  if (!task) notFound();

  const [events, logs, ratio] = await Promise.all([
    listTaskEvents(user.id, taskId),
    listWorklogs(user.id, taskId),
    completionRatio(user.id, taskId),
  ]);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href={`/p/${projectId}/tasks`} className="text-primary hover:underline">
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
          <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{task.description}</p>
        )}
        {task.completionNote && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <span className="font-medium">完成说明：</span>
            {task.completionNote}
          </p>
        )}
        {task.rejectReason && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <span className="font-medium">打回原因：</span>
            {task.rejectReason}
          </p>
        )}
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold">操作</h2>
        <TaskActions task={task} role={access.role} actorId={user.id} />
        <DueDateForm taskId={task.id} projectId={projectId} dueDate={task.dueDate} />
        {canDeleteTask(access.role) && (
          <DeleteTaskButton taskId={task.id} projectId={projectId} />
        )}
      </section>

      {task.subtasks.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold">子任务（{task.subtasks.length}）</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {task.subtasks.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/p/${projectId}/tasks/${s.id}`} className="hover:underline">
                  {s.title}
                </Link>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ul>
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
            <h2 className="font-display text-sm font-semibold text-foreground">全流程活动审计流与状态溯源</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {events.length} 次流转
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            不可篡改事件溯源
          </span>
        </div>
        <TaskAuditStream events={events} />
      </section>
    </main>
  );
}

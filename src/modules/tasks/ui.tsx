"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  addWorklogAction,
  createMilestoneAction,
  createTaskAction,
  deleteTaskAction,
  setDueDateAction,
  transitionAction,
  type FormState,
} from "@/modules/tasks/actions";
import type { TaskDTO, TransitionAction } from "@/modules/tasks";
import { STATUS_LABELS, ACTION_LABELS, canDeleteTask } from "@/modules/tasks/states";
import type { TeamRole } from "@/db/schema";
import { StatusPill, PriorityPill } from "@/components/ui/badge";

const btn =
  "rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50";
const btnPrimary =
  "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-brand-hover disabled:opacity-50";

function ErrorLine({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return <p className="text-xs text-destructive">{state.error}</p>;
}

export function CreateTaskForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTaskAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-sm font-semibold">新建任务</h2>
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="title"
        placeholder="任务标题"
        required
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        placeholder="描述（可选）"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          name="dueDate"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <select
          name="priority"
          defaultValue="medium"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="low">低优先</option>
          <option value="medium">中优先</option>
          <option value="high">高优先</option>
        </select>
        <button disabled={pending} className={btnPrimary}>
          {pending ? "创建中…" : "创建"}
        </button>
      </div>
      <ErrorLine state={state} />
      {state?.ok && <p className="text-xs text-emerald-600">{state.ok}</p>}
    </form>
  );
}

const ACTIONS_BY_ROLE: Record<
  string,
  Partial<Record<TaskDTO["status"], TransitionAction[]>>
> = {
  student: {
    unclaimed: ["claim"],
    in_progress: ["submit", "unclaim"],
    rejected: ["resubmit", "unclaim"],
  },
  teacher: {
    in_progress: ["assign", "unclaim"],
    submitted: ["accept", "reject"],
    accepted: ["reopen"],
  },
  admin: {
    unclaimed: ["claim", "assign"],
    in_progress: ["submit", "assign", "unclaim"],
    submitted: ["accept", "reject"],
    rejected: ["resubmit", "assign", "unclaim"],
    accepted: ["reopen"],
  },
};

const NEED_NOTE: TransitionAction[] = ["submit", "resubmit", "reject"];

export function TaskActions({
  task,
  role,
  actorId,
}: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    transitionAction,
    null,
  );
  let actions = ACTIONS_BY_ROLE[role]?.[task.status] ?? [];
  if (
    (task.status === "in_progress" || task.status === "rejected") &&
    task.assigneeId !== actorId &&
    role === "student"
  ) {
    actions = actions.filter((a) => a !== "submit" && a !== "resubmit");
  }
  if (actions.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="projectId" value={task.projectId} />
      {NEED_NOTE.some((a) => actions.includes(a)) && (
        <input
          name="note"
          placeholder="说明 / 验收意见"
          className="h-8 w-48 rounded-md border border-input bg-background px-2 text-xs"
        />
      )}
      {actions.includes("assign") && (
        <input
          name="assigneeId"
          placeholder="指派给（用户 ID）"
          className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
        />
      )}
      {actions.map((a) => (
        <button key={a} name="action" value={a} disabled={pending} className={a === "accept" || a === "claim" ? btnPrimary : btn}>
          {ACTION_LABELS[a]}
        </button>
      ))}
      <ErrorLine state={state} />
    </form>
  );
}

export function TaskCard({
  task,
  role,
  actorId,
}: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/p/${task.projectId}/tasks/${task.id}`}
          className="font-medium hover:underline"
        >
          {task.title}
        </Link>
        <div className="flex shrink-0 gap-1.5">
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {task.assigneeName ? `负责：${task.assigneeName}` : "未认领"}
        {task.dueDate ? ` · 截止 ${task.dueDate}` : ""}
      </p>
      {task.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
      )}
      <TaskActions task={task} role={role} actorId={actorId} />
    </div>
  );
}

export function DeleteTaskButton({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const [, formAction, pending] = useActionState<FormState, FormData>(
    deleteTaskAction,
    null,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <button disabled={pending} className={`${btn} text-destructive`}>
        删除任务
      </button>
    </form>
  );
}

export { canDeleteTask };

export function WorklogForm({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addWorklogAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          name="workDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          name="minutes"
          required
          min={1}
          placeholder="分钟"
          className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <input
          name="note"
          placeholder="备注"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <button disabled={pending} className={btnPrimary}>
          记工时
        </button>
      </div>
      <ErrorLine state={state} />
      {state?.ok && <p className="text-xs text-emerald-600">{state.ok}</p>}
    </form>
  );
}

export function DueDateForm({
  taskId,
  projectId,
  dueDate,
}: {
  taskId: string;
  projectId: string;
  dueDate: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setDueDateAction,
    null,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input
        type="date"
        name="dueDate"
        defaultValue={dueDate ?? ""}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      />
      <button className={btn}>改截止</button>
      <ErrorLine state={state} />
    </form>
  );
}

export function MilestoneForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createMilestoneAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-sm font-semibold">新建里程碑</h2>
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="title"
        required
        placeholder="如：开题 / 中期 / 结题"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <select
          name="kind"
          defaultValue="custom"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="open_topic">开题</option>
          <option value="midterm">中期</option>
          <option value="final">结题</option>
          <option value="defense">答辩</option>
          <option value="custom">自定义</option>
        </select>
        <input
          type="date"
          name="targetDate"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <button disabled={pending} className={btnPrimary}>
          创建
        </button>
      </div>
      <ErrorLine state={state} />
      {state?.ok && <p className="text-xs text-emerald-600">{state.ok}</p>}
    </form>
  );
}

export function statusLabel(status: TaskDTO["status"]) {
  return STATUS_LABELS[status];
}

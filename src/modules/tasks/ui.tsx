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
  "rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50 transition active:scale-95";
const btnPrimary =
  "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-brand-hover disabled:opacity-50 transition active:scale-95";

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
        <button
          key={a}
          name="action"
          value={a}
          disabled={pending}
          className={a === "accept" || a === "claim" ? btnPrimary : btn}
        >
          {pending ? "处理中…" : ACTION_LABELS[a]}
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
  showProjectBadge = false,
  projectName,
}: {
  task: TaskDTO & { projectName?: string };
  role: TeamRole;
  actorId: string;
  showProjectBadge?: boolean;
  projectName?: string;
}) {
  const shortId = task.id ? `#${task.id.slice(0, 6)}` : "";
  const effectiveProjectName = projectName || task.projectName;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    task.dueDate && task.dueDate < today && task.status !== "accepted";
  const isDueToday = task.dueDate && task.dueDate === today;

  return (
    <div className="group rounded-2xl border border-border bg-card p-4.5 shadow-xs transition hover:border-border/90 hover:shadow-sm space-y-3">
      {/* 顶部身份与状态条 (Linear/Harness Style) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          {shortId && (
            <span className="font-mono text-[11px] font-medium text-muted-foreground">
              {shortId}
            </span>
          )}
          {showProjectBadge && effectiveProjectName && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {effectiveProjectName}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
              {task.assigneeName ? task.assigneeName.slice(0, 1).toUpperCase() : "?"}
            </div>
            <span className="text-[11px]">{task.assigneeName ?? "未认领"}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
        </div>
      </div>

      {/* 任务标题与描述 */}
      <div className="space-y-1">
        <Link
          href={`/p/${task.projectId}/tasks/${task.id}`}
          className="font-medium text-sm text-foreground hover:text-blue-600 transition tracking-tight line-clamp-1"
        >
          {task.title}
        </Link>
        {task.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        )}
      </div>

      {/* 状态语境看板 */}
      {task.status === "submitted" && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <span className="font-semibold block mb-0.5">📝 待验收完成说明：</span>
          <p className="text-[11px] leading-relaxed">
            {task.completionNote || "提交人未附带补充说明"}
          </p>
        </div>
      )}

      {task.status === "rejected" && (
        <div className="rounded-xl border border-red-200/70 bg-red-50/50 p-2.5 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <span className="font-semibold block mb-0.5">⚠️ 教师打回修改意见：</span>
          <p className="text-[11px] leading-relaxed">
            {task.rejectReason || "请与指导教师沟通后修改重交"}
          </p>
        </div>
      )}

      {/* 辅助时间与详情通道 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
        <div>
          {task.dueDate ? (
            <span
              className={`inline-flex items-center gap-1 ${
                isOverdue
                  ? "font-semibold text-red-600"
                  : isDueToday
                  ? "font-semibold text-amber-600"
                  : "text-muted-foreground"
              }`}
            >
              📅 {isOverdue ? `已逾期 (${task.dueDate})` : isDueToday ? "今日截止" : task.dueDate}
            </span>
          ) : (
            <span>无截止日期</span>
          )}
        </div>
        <Link
          href={`/p/${task.projectId}/tasks/${task.id}`}
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          详情与工时 →
        </Link>
      </div>

      {/* 原位流转动作栏 */}
      <div className="border-t border-border/60 pt-2.5">
        <TaskActions task={task} role={role} actorId={actorId} />
      </div>
    </div>
  );
}

export const WorkstreamCard = TaskCard;


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
        {pending ? "删除中…" : "删除任务"}
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
          {pending ? "记录中…" : "记工时"}
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
  const [state, formAction, pending] = useActionState<FormState, FormData>(
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
      <button disabled={pending} className={btn}>
        {pending ? "修改中…" : "改截止"}
      </button>
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
          {pending ? "创建中…" : "创建"}
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

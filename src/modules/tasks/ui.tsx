"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addWorklogAction,
  createMilestoneAction,
  createTaskAction,
  createSubtaskAction,
  deleteTaskAction,
  setDueDateAction,
  transitionAction,
  loadTaskAssigneesAction,
  loadTaskPermissionsAction,
  type FormState,
} from "@/modules/tasks/actions";
import type { TaskDTO } from "./service";
import {
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  availableTransitions,
  canDeleteTask,
  type TransitionRule,
} from "./states";
import type { TeamRole } from "@/db/schema";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  POSITION_META,
  type TeamPosition,
  type TaskPermissions,
} from "@/modules/identity/client";

const btn =
  "rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50 transition active:scale-95";
const btnPrimary =
  "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-brand-hover disabled:opacity-50 transition active:scale-95";

function ErrorLine({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {state.error}
    </p>
  );
}

export function CreateTaskForm({
  projectId,
  onCreated,
  parentTaskId,
}: {
  projectId: string;
  onCreated?: () => void;
  parentTaskId?: string;
}) {
  const id = useId();
  const [fields, setFields] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium",
  });
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await (parentTaskId
        ? createSubtaskAction(prev, data)
        : createTaskAction(prev, data));
      if (result?.ok) {
        setFields({
          title: "",
          description: "",
          dueDate: "",
          priority: "medium",
        });
        onCreated?.();
      }
      return result;
    },
    null,
  );
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="font-display text-sm font-semibold">
        {parentTaskId ? "拆分子任务" : "新建任务"}
      </h2>
      {parentTaskId && (
        <input type="hidden" name="parentTaskId" value={parentTaskId} />
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={`${id}-title`} className="block text-xs font-medium">
        任务标题
      </label>
      <Input
        id={`${id}-title`}
        name="title"
        value={fields.title}
        onChange={(event) =>
          setFields({ ...fields, title: event.target.value })
        }
        maxLength={200}
        placeholder="任务标题"
        required
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <textarea
        aria-label="任务描述"
        name="description"
        value={fields.description}
        onChange={(event) =>
          setFields({ ...fields, description: event.target.value })
        }
        placeholder="描述（可选）"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="任务截止日期"
          type="date"
          name="dueDate"
          value={fields.dueDate}
          onChange={(event) =>
            setFields({ ...fields, dueDate: event.target.value })
          }
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <select
          aria-label="任务优先级"
          name="priority"
          value={fields.priority}
          onChange={(event) =>
            setFields({ ...fields, priority: event.target.value })
          }
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

export type AssigneeOption = {
  id: string;
  name: string;
  role: TeamRole;
  positions?: TeamPosition[];
  canExecute?: boolean;
};

export function TaskWorkflow({ status }: { status?: TaskDTO["status"] }) {
  const main: TaskDTO["status"][] = [
    "unclaimed",
    "in_progress",
    "submitted",
    "accepted",
  ];
  return (
    <section
      aria-label="任务流转路径"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">从认领到验收</h2>
        <span className="text-xs text-muted-foreground">
          学生推进 · 教师验收
        </span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-4">
        {main.map((step, index) => (
          <li
            key={step}
            aria-current={step === status ? "step" : undefined}
            className={`relative rounded-lg border p-3 ${step === status ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-border bg-background"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <StatusPill status={step} />
              {index < 3 && (
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground"
                />
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {STATUS_DESCRIPTIONS[step]}
            </p>
          </li>
        ))}
      </ol>
      <div
        aria-current={status === "rejected" ? "step" : undefined}
        className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${status === "rejected" ? "border-red-300 bg-red-50" : "border-dashed border-border"}`}
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5 text-red-600" />
        <StatusPill status="rejected" />
        <span className="text-muted-foreground">
          验收时打回 → 按意见修改 → 重新提交到待验收
        </span>
      </div>
    </section>
  );
}

export function TransitionDialog({
  task,
  rule,
  members,
  onClose,
  onSuccess,
}: {
  task: TaskDTO;
  rule: TransitionRule;
  members: AssigneeOption[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const id = useId();
  const [assigneeId, setAssigneeId] = useState("");
  const [note, setNote] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const parentDialog = useRef<HTMLElement | null>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await transitionAction(prev, data);
      if (result?.ok) {
        onSuccess?.();
        onClose();
      }
      return result;
    },
    null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            parentDialog.current =
              returnFocus.current?.closest<HTMLElement>('[role="dialog"]') ??
              null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else parentDialog.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
        >
          <Dialog.Title className="pr-8 text-lg font-semibold">
            {rule.label}任务
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {task.title}
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label="关闭"
              className="absolute right-3 top-3"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          <div className="my-5 flex items-center gap-3 rounded-lg bg-muted p-3">
            <StatusPill status={task.status} />
            <ArrowRight className="h-4 w-4" />
            <StatusPill status={rule.to} />
          </div>
          {task.status === "rejected" && task.rejectReason && (
            <p className="mb-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-800">
              修改意见：{task.rejectReason}
            </p>
          )}
          {task.status === "submitted" && task.completionNote && (
            <p className="mb-4 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              完成说明：{task.completionNote}
            </p>
          )}
          <form
            action={formAction}
            onReset={(event) => event.preventDefault()}
            className="space-y-4"
          >
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="action" value={rule.action} />
            {rule.setsAssignee && (
              <div className="space-y-2">
                <label
                  htmlFor={`${id}-assignee`}
                  className="text-sm font-medium"
                >
                  选择团队成员
                </label>
                <select
                  id={`${id}-assignee`}
                  name="assigneeId"
                  required
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>
                    请选择负责人
                  </option>
                  {members
                    .filter(
                      (member) =>
                        member.canExecute ?? member.role !== "teacher",
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ·{" "}
                        {member.positions
                          ?.map((position) => POSITION_META[position].label)
                          .join("、") ??
                          (member.role === "student" ? "队员" : "管理员")}
                      </option>
                    ))}
                </select>
                {members.length === 0 && (
                  <p role="alert" className="text-xs text-destructive">
                    未能加载团队成员，请关闭后重试。
                  </p>
                )}
              </div>
            )}
            {rule.noteRequired && (
              <div className="space-y-2">
                <label htmlFor={`${id}-note`} className="text-sm font-medium">
                  {rule.action === "reject" ? "修改意见" : "完成说明"}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <textarea
                  id={`${id}-note`}
                  name="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  required
                  maxLength={5000}
                  rows={4}
                  placeholder={
                    rule.action === "reject"
                      ? "具体指出需要修改的内容，让同学知道下一步怎么做"
                      : "说明完成内容、验证结果，可附成果链接"
                  }
                  className="w-full rounded-md border border-input bg-background p-3 text-sm"
                  autoFocus
                />
              </div>
            )}
            <div role="alert">
              <ErrorLine state={state} />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                disabled={
                  pending || (rule.setsAssignee && members.length === 0)
                }
              >
                {pending ? "处理中…" : `确认${rule.label}`}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TaskActions({
  task,
  role,
  actorId,
  members = [],
}: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
  members?: AssigneeOption[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    transitionAction,
    null,
  );
  const [selected, setSelected] = useState<TransitionRule | null>(null);
  const [loadedOptions, setOptions] = useState(members);
  const options = members.length ? members : loadedOptions;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [resolved, setResolved] = useState<{
    task: TaskDTO;
    permissions?: TaskPermissions;
    error: string;
  } | null>(null);
  // 旧工作台 DTO 没有权限快照，进入操作区时从统一入口补齐。
  useEffect(() => {
    if (task.permissions) return;
    let active = true;
    void loadTaskPermissionsAction(task.id)
      .then((result) => {
        if (active) setResolved({ task, ...result });
      })
      .catch(() => {
        if (active) setResolved({ task, error: "暂时无法加载操作" });
      });
    return () => {
      active = false;
    };
  }, [task, actorId, role]);
  const permissions =
    task.permissions ??
    (resolved?.task === task ? resolved.permissions : undefined);
  if (!permissions)
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {resolved?.task === task && resolved.error ? (
          <Link
            className="text-brand underline"
            href={`/p/${task.projectId}/tasks/${task.id}`}
          >
            查看任务详情与可用操作
          </Link>
        ) : (
          "正在加载可用操作…"
        )}
      </p>
    );
  const actions = availableTransitions({ ...task, permissions }, role, actorId);
  if (actions.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        {task.status === "submitted"
          ? "等待教师验收"
          : task.status === "accepted"
            ? "任务已验收完成"
            : "由负责人推进任务"}
      </p>
    );

  async function openDialog(rule: TransitionRule) {
    setLoadError("");
    if (rule.setsAssignee && options.length === 0) {
      setLoading(true);
      const result = await loadTaskAssigneesAction(task.id);
      setLoading(false);
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setOptions(result.members);
    }
    setSelected(rule);
  }

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="taskId" value={task.id} />
        {actions.map((rule) => (
          <Button
            key={rule.action}
            type={
              rule.noteRequired ||
              rule.setsAssignee ||
              rule.action === "reopen" ||
              rule.action === "unclaim"
                ? "button"
                : "submit"
            }
            name="action"
            value={rule.action}
            size="sm"
            variant={
              rule.action === "accept" ||
              rule.action === "claim" ||
              (rule.noteRequired && rule.action !== "reject")
                ? "default"
                : "outline"
            }
            disabled={pending || loading}
            onClick={
              rule.noteRequired ||
              rule.setsAssignee ||
              rule.action === "reopen" ||
              rule.action === "unclaim"
                ? () => void openDialog(rule)
                : undefined
            }
          >
            {pending || loading ? "处理中…" : rule.label}
          </Button>
        ))}
      </form>
      <div aria-live="polite">
        <ErrorLine state={state} />
        {state?.ok && <p className="text-xs text-emerald-700">{state.ok}</p>}
        {loadError && (
          <p role="alert" className="text-xs text-destructive">
            {loadError}
          </p>
        )}
      </div>
      {selected && (
        <TransitionDialog
          task={task}
          rule={selected}
          members={options}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
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
              {task.assigneeName
                ? task.assigneeName.slice(0, 1).toUpperCase()
                : "?"}
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
          <span className="font-semibold block mb-0.5">
            📝 待验收完成说明：
          </span>
          <p className="text-[11px] leading-relaxed">
            {task.completionNote || "提交人未附带补充说明"}
          </p>
        </div>
      )}

      {task.status === "rejected" && (
        <div className="rounded-xl border border-red-200/70 bg-red-50/50 p-2.5 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <span className="font-semibold block mb-0.5">
            ⚠️ 教师打回修改意见：
          </span>
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
              📅{" "}
              {isOverdue
                ? `已逾期 (${task.dueDate})`
                : isDueToday
                  ? "今日截止"
                  : task.dueDate}
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await deleteTaskAction(prev, data);
      if (result?.ok) {
        setOpen(false);
        router.push(`/p/${projectId}/tasks`);
      }
      return result;
    },
    null,
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive">
          删除任务
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">
            确认删除任务？
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            任务及其子任务、工时和活动记录将一并删除。此操作无法撤销。
          </Dialog.Description>
          <form action={formAction} className="mt-5 space-y-3">
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="projectId" value={projectId} />
            <ErrorLine state={state} />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button variant="destructive" disabled={pending}>
                {pending ? "删除中…" : "确认删除"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { canDeleteTask };

export function WorklogForm({
  taskId,
  projectId,
  defaultDate,
}: {
  taskId: string;
  projectId: string;
  defaultDate: string;
}) {
  const id = useId();
  const [fields, setFields] = useState({
    workDate: defaultDate,
    minutes: "",
    note: "",
  });
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await addWorklogAction(prev, data);
      if (result?.ok)
        setFields((current) => ({ ...current, minutes: "", note: "" }));
      return result;
    },
    null,
  );
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset
        disabled={pending}
        className="grid items-end gap-3 sm:grid-cols-[170px_130px_1fr_auto]"
      >
        <div className="space-y-1.5">
          <label htmlFor={`${id}-date`} className="text-xs font-medium">
            投入日期
          </label>
          <Input
            id={`${id}-date`}
            type="date"
            name="workDate"
            required
            value={fields.workDate}
            onChange={(event) =>
              setFields({ ...fields, workDate: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-minutes`} className="text-xs font-medium">
            投入分钟
          </label>
          <Input
            id={`${id}-minutes`}
            type="number"
            name="minutes"
            required
            min={1}
            max={1440}
            step={1}
            value={fields.minutes}
            onChange={(event) =>
              setFields({ ...fields, minutes: event.target.value })
            }
            placeholder="例如 30"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-note`} className="text-xs font-medium">
            工作说明（选填）
          </label>
          <Input
            id={`${id}-note`}
            name="note"
            value={fields.note}
            onChange={(event) =>
              setFields({ ...fields, note: event.target.value })
            }
            maxLength={2000}
            placeholder="这次完成了什么…"
          />
        </div>
        <Button type="submit">{pending ? "记录中…" : "记工时"}</Button>
      </fieldset>
      <ErrorLine state={state} />
      {state?.ok && (
        <p role="status" className="text-xs text-brand">
          {state.ok}
        </p>
      )}
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
    <form
      action={formAction}
      className="space-y-2 rounded-xl border border-border bg-card p-4"
    >
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

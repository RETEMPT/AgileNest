"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import {
  createMilestoneAction,
  createTaskAction,
  createSubtaskAction,
  deleteTaskAction,
  setDueDateAction,
  transitionAction,
  loadTaskAssigneesAction,
  loadTaskPermissionsAction,
  loadProjectTaskAssigneesAction,
  type FormState,
} from "@/modules/tasks/actions";
import type { TaskDTO } from "./service";
import {
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  availableTransitions,
  canDeleteTask,
  transitionNeedsDialog,
  type TransitionRule,
} from "./states";
import type { TeamRole } from "@/db/schema";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  POSITION_META,
  type TeamPosition,
  type TaskPermissions,
} from "@/modules/identity/client";
import { StructuredTransitionFields } from "./delivery-fields";
import { DiscardChangesDialog } from "./form-guards";
import type { AcceptanceCriterion } from "./delivery-types";
import { taskDependencyMessage } from "./organization-client";

export { TaskDetailSummary, type TaskDetailSummaryProps } from "./detail-summary";
export { TaskOrganization, TaskLabelFilter, TaskLabelPill } from "./organization-ui";

function ErrorLine({ state }: { state: FormState }) {
  return <FormFeedback message={state?.error} className="text-xs" />;
}

export function CreateTaskForm({
  projectId,
  onCreated,
  parentTaskId,
  milestoneId,
  onPendingChange,
}: {
  projectId: string;
  onCreated?: () => void;
  parentTaskId?: string;
  milestoneId?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const id = useId();
  const notify = useFeedback();
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [assigneeError, setAssigneeError] = useState("");
  const [requestKey, setRequestKey] = useState("");
  useEffect(() => {
    let active = true;
    const initializeCriteria = () => { setCriteria((current) => current.length ? current : [{ id: crypto.randomUUID(), text: "" }]); setRequestKey((current) => current || crypto.randomUUID()); };
    void loadProjectTaskAssigneesAction(projectId).then((result) => { if (active) { setAssignees(result.members); setAssigneeError(result.error); initializeCriteria(); } }).catch(() => { if (active) { setAssigneeError("负责人加载失败，仍可先发布为待认领任务"); initializeCriteria(); } });
    return () => { active = false; };
  }, [projectId]);
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
        notify(result.ok);
        setFields({
          title: "",
          description: "",
          dueDate: "",
          priority: "medium",
        });
        setAssigneeId(""); setCriteria([{ id: crypto.randomUUID(), text: "" }]); setRequestKey(crypto.randomUUID());
        onCreated?.();
      }
      return result;
    },
    null,
  );
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);
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
      {milestoneId && <input type="hidden" name="milestoneId" value={milestoneId} />}
      <input type="hidden" name="acceptanceCriteria" value={JSON.stringify(criteria)} />
      <input type="hidden" name="requestKey" value={requestKey} />
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
        disabled={pending}
        placeholder="例如：完成研究报告初稿 / 整理课程展示材料"
        required
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label htmlFor={`${id}-description`} className="block text-xs font-medium">
        工作目标与背景 <span className="font-normal text-muted-foreground">（可选）</span>
      </label>
      <textarea
        id={`${id}-description`}
        name="description"
        value={fields.description}
        onChange={(event) =>
          setFields({ ...fields, description: event.target.value })
        }
        placeholder="说明工作目标、交付内容，以及如何确认完成"
        rows={3}
        maxLength={10000}
        disabled={pending}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="space-y-2"><label htmlFor={`${id}-owner`} className="block text-xs font-medium">负责人 / 认领方式</label><select id={`${id}-owner`} name="assigneeId" value={assigneeId} disabled={pending} onChange={(event) => setAssigneeId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">发布到任务池，等待成员认领</option>{assignees.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.positions?.map((position) => POSITION_META[position].label).join("、")}</option>)}</select><FormFeedback message={assigneeError} /></div>
      <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"><div><h3 className="text-xs font-semibold">发布时的验收要求 <span className="text-destructive">*</span></h3></div>{criteria.map((criterion, index) => <div key={criterion.id} className="flex items-start gap-2"><Input aria-label={`任务发布的第 ${index + 1} 项验收要求`} required maxLength={1000} value={criterion.text} disabled={pending} placeholder="例如：研究报告包含结论、证据和材料来源" onChange={(event) => setCriteria((current) => current.map((item) => item.id === criterion.id ? { ...item, text: event.target.value } : item))} /><Button type="button" size="icon" variant="ghost" aria-label={`移除第 ${index + 1} 项发布要求`} disabled={pending || criteria.length <= 1} onClick={() => setCriteria((current) => current.filter((item) => item.id !== criterion.id))}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" size="sm" variant="outline" disabled={pending || criteria.length >= 30} onClick={() => setCriteria((current) => [...current, { id: crypto.randomUUID(), text: "" }])}><Plus className="h-3.5 w-3.5" />添加要求</Button></section>
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          日期与优先级（可选）
        </summary>
        <div className="mt-3 grid gap-3">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-due`} className="block text-xs font-medium">截止日期</label>
            <Input
              id={`${id}-due`}
              type="date"
              name="dueDate"
              value={fields.dueDate}
              disabled={pending}
              onChange={(event) => setFields({ ...fields, dueDate: event.target.value })}
              className="w-full min-w-0"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-priority`} className="block text-xs font-medium">优先级</label>
            <select
              id={`${id}-priority`}
              name="priority"
              value={fields.priority}
              disabled={pending}
              onChange={(event) => setFields({ ...fields, priority: event.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="low">低优先</option>
              <option value="medium">中优先</option>
              <option value="high">高优先</option>
            </select>
          </div>
        </div>
      </details>
      <ErrorLine state={state} />
      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        <Button size="sm" disabled={pending || !criteria.length || !requestKey} loading={pending}>
          {pending ? "创建中…" : parentTaskId ? "创建子任务" : "创建任务"}
        </Button>
      </div>
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
        <h2 className="text-sm font-semibold">任务流程</h2>
        <span className="text-xs text-muted-foreground">
          任务执行 · 成果验收
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
        className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${status === "rejected" ? "border-destructive/30 bg-destructive/5" : "border-dashed border-border"}`}
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
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
  onPendingChange,
}: {
  task: TaskDTO;
  rule: TransitionRule;
  members: AssigneeOption[];
  onClose: () => void;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const id = useId();
  const [assigneeId, setAssigneeId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [structuredReady, setStructuredReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const structuredAction = ["submit", "resubmit", "accept", "reject"].includes(rule.action)
    ? rule.action as "submit" | "resubmit" | "accept" | "reject"
    : null;
  const returnFocus = useRef<HTMLElement | null>(null);
  const parentDialog = useRef<HTMLElement | null>(null);
  const notify = useFeedback();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await transitionAction(prev, data);
      if (result?.ok) {
        notify(result.ok);
        onSuccess?.();
        onClose();
      }
      return result;
    },
    null,
  );
  const busy = pending || uploading;
  useEffect(() => { onPendingChange?.(busy); return () => onPendingChange?.(false); }, [busy, onPendingChange]);
  function tryClose() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) tryClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
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
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6"
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
              disabled={busy}
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
            <p className="mb-4 whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm [overflow-wrap:anywhere]">
              修改意见：{task.rejectReason}
            </p>
          )}
          {task.status === "submitted" && task.completionNote && (
            <p className="mb-4 whitespace-pre-wrap break-words rounded-lg border border-brand/20 bg-brand-soft p-3 text-sm [overflow-wrap:anywhere]">
              完成说明：{task.completionNote}
            </p>
          )}
          <form
            action={formAction}
            onReset={(event) => event.preventDefault()}
            onSubmit={(event) => { if (busy || (structuredAction && !structuredReady)) event.preventDefault(); }}
            className="space-y-4"
          >
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="action" value={rule.action} />
            <fieldset disabled={busy} className="space-y-4">
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
                  onChange={(event) => { setAssigneeId(event.target.value); setDirty(true); }}
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
                          (member.role === "student" ? "组员" : member.role === "teacher" ? "指导老师" : "管理员")}
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
            {structuredAction && <StructuredTransitionFields task={task} action={structuredAction} disabled={busy} onReadyChange={setStructuredReady} onDirtyChange={setDirty} onBusyChange={setUploading} />}
            <div role="alert">
              <ErrorLine state={state} />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={tryClose}
              >
                取消
              </Button>
              <Button
                disabled={
                  busy || (rule.setsAssignee && members.length === 0) || Boolean(structuredAction && !structuredReady)
                }
               loading={pending}>
                {pending ? "处理中…" : `确认${rule.label}`}
              </Button>
            </div>
            </fieldset>
          </form>
          <DiscardChangesDialog open={discardOpen} onKeepEditing={() => setDiscardOpen(false)} onDiscard={onClose} />
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
  onPendingChange,
}: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
  members?: AssigneeOption[];
  onPendingChange?: (pending: boolean) => void;
}) {
  const notify = useFeedback();
  const [acting, setActing] = useState("");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      setActing(String(data.get("action") ?? ""));
      const result = await transitionAction(prev, data);
      if (result?.ok) notify(result.ok);
      return result;
    },
    null,
  );
  const [selected, setSelected] = useState<TransitionRule | null>(null);
  const [loadedOptions, setOptions] = useState(members);
  const options = members.length ? members : loadedOptions;
  const [loading, setLoading] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [resolved, setResolved] = useState<{
    task: TaskDTO;
    permissions?: TaskPermissions;
    error: string;
  } | null>(null);
  useEffect(() => { onPendingChange?.(pending || loading || dialogPending); return () => onPendingChange?.(false); }, [pending, loading, dialogPending, onPendingChange]);
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
        {task.status === "submitted" && task.acceptBlocked
          ? "请先验收全部子任务，再验收父任务；仍可按权限打回当前提交"
          : task.status === "submitted"
          ? "等待管理员、副管理员或指导老师验收"
          : task.status === "accepted"
            ? "任务已验收完成"
            : "由负责人推进任务"}
      </p>
    );

  async function openDialog(rule: TransitionRule) {
    setLoadError("");
    setActing(rule.action);
    if (rule.setsAssignee && options.length === 0) {
      setLoading(true);
      try {
        const result = await loadTaskAssigneesAction(task.id);
        if (result.error) { setLoadError(result.error); return; }
        setOptions(result.members);
      } catch {
        setLoadError("成员加载失败，请稍后重试");
        return;
      } finally {
        setLoading(false);
      }
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
            type={transitionNeedsDialog(rule) ? "button" : "submit"}
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
            disabled={pending || loading || dialogPending}
            onClick={
              transitionNeedsDialog(rule)
                ? () => void openDialog(rule)
                : undefined
            }
           loading={(pending || loading) && acting === rule.action}>
            {(pending || loading) && acting === rule.action ? "处理中…" : rule.label}
          </Button>
        ))}
      </form>
      <div aria-live="polite">
        <ErrorLine state={state} />
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
          onPendingChange={setDialogPending}
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
          {task.id && (
            <Link href={`/p/${task.projectId}/tasks/${task.id}`} aria-label={`查看任务详情：${task.title}`} title="查看任务详情" className="inline-flex items-center gap-1.5 rounded font-mono text-[11px] font-medium text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <FileText aria-hidden="true" className="h-4 w-4" />查看详情
            </Link>
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

      {task.blocked && <p title={taskDependencyMessage(task) ?? undefined} className="text-xs font-medium text-amber-800 dark:text-amber-200">等待其他任务验收 · 打开详情查看原因</p>}

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
            修改意见：
          </span>
          <p className="text-[11px] leading-relaxed">
            {task.rejectReason || "请联系验收人确认修改要求"}
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
          任务详情 →
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
  const notify = useFeedback();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await deleteTaskAction(prev, data);
      if (result?.ok) {
        notify(result.ok);
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
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">
            确认删除任务？
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            任务及其子任务和相关历史记录将一并删除。此操作无法撤销。
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
              <Button variant="destructive" disabled={pending} loading={pending}>
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
      <Button size="sm" variant="outline" disabled={pending} loading={pending}>
        {pending ? "修改中…" : "改截止"}
      </Button>
      <ErrorLine state={state} />
    </form>
  );
}

export function MilestoneForm({ projectId, onCreated, onPendingChange }: { projectId: string; onCreated?: () => void; onPendingChange?: (pending: boolean) => void }) {
  const id = useId();
  const [requestKey, setRequestKey] = useState("");
  const [fields, setFields] = useState({ title: "", description: "", kind: "custom", targetDate: "" });
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) setRequestKey(crypto.randomUUID()); }); return () => { active = false; }; }, []);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, data) => {
      const result = await createMilestoneAction(previous, data);
      if (result?.ok) {
        setFields({ title: "", description: "", kind: "custom", targetDate: "" });
        setRequestKey(crypto.randomUUID());
        onCreated?.();
      }
      return result;
    },
    null,
  );
  useEffect(() => { onPendingChange?.(pending); return () => onPendingChange?.(false); }, [pending, onPendingChange]);
  return (
    <form
      action={formAction}
      className="space-y-2 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <label htmlFor={`${id}-title`} className="block text-xs font-medium">里程碑名称</label>
      <input
        id={`${id}-title`}
        name="title"
        required
        maxLength={200}
        value={fields.title}
        disabled={pending}
        onChange={(event) => setFields({ ...fields, title: event.target.value })}
        placeholder="如：开题 / 中期 / 结题"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label htmlFor={`${id}-description`} className="block text-xs font-medium">阶段目标（可选）</label>
      <textarea id={`${id}-description`} name="description" maxLength={10000} rows={3} value={fields.description} disabled={pending} onChange={(event) => setFields({ ...fields, description: event.target.value })} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">阶段类型
        <select
          name="kind"
          value={fields.kind}
          disabled={pending}
          onChange={(event) => setFields({ ...fields, kind: event.target.value })}
          className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="open_topic">开题</option>
          <option value="midterm">中期</option>
          <option value="final">结题</option>
          <option value="defense">答辩</option>
          <option value="custom">自定义</option>
        </select>
        </label>
        <label className="space-y-1 text-xs font-medium">目标日期（可选）
        <input
          type="date"
          name="targetDate"
          value={fields.targetDate}
          disabled={pending}
          onChange={(event) => setFields({ ...fields, targetDate: event.target.value })}
          className="block w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        </label>
        <Button size="sm" disabled={pending || !requestKey} loading={pending} className="sm:col-span-2 sm:justify-self-end">
          {pending ? "创建中…" : "创建里程碑"}
        </Button>
      </div>
      <ErrorLine state={state} />
      {state?.ok && <p className="text-xs text-emerald-600">{state.ok}</p>}
    </form>
  );
}

export function statusLabel(status: TaskDTO["status"]) {
  return STATUS_LABELS[status];
}

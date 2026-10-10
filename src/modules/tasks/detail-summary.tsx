import Link from "next/link";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import type { TaskDTO } from "./service";
import { STATUS_DESCRIPTIONS } from "./states";

export type TaskDetailSummaryProps = {
  task: TaskDTO;
  subtasks?: readonly TaskDTO[];
  milestoneName?: string | null;
  loggedMinutes?: number;
  headingLevel?: "h1" | "h2";
};

export function TaskDetailSummary({
  task,
  subtasks,
  milestoneName,
  loggedMinutes,
  headingLevel = "h2",
}: TaskDetailSummaryProps) {
  const Heading = headingLevel;
  const SectionHeading = headingLevel === "h1" ? "h2" : "h3";
  const showsCompletion = task.status === "submitted" || task.status === "accepted";
  const currentNote =
    task.status === "rejected"
      ? task.rejectReason
      : showsCompletion
        ? task.completionNote
        : null;
  const currentLabel =
    task.status === "rejected" ? "最新修改意见" : "最新完成说明";
  const previousNotes = [
    ...(task.completionNote && !showsCompletion
      ? [{ label: "最近一次完成说明", note: task.completionNote }]
      : []),
    ...(task.rejectReason && task.status !== "rejected"
      ? [{ label: "最近一次修改意见", note: task.rejectReason }]
      : []),
  ];

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-3">
        <Heading className="break-words font-display text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">
          {task.title}
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {STATUS_DESCRIPTIONS[task.status]}
        </p>
      </div>

      {(currentNote || task.status === "rejected" || task.status === "submitted") && (
        <section
          aria-label={currentLabel}
          className={`space-y-2 rounded-xl border p-4 ${task.status === "rejected" ? "border-destructive/30 bg-destructive/5" : "border-brand/20 bg-brand-soft"}`}
        >
          <SectionHeading className="text-sm font-semibold">{currentLabel}</SectionHeading>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {currentNote || "暂无说明，可在活动记录中核对最近一次操作。"}
          </p>
        </section>
      )}

      {previousNotes.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            查看最近的提交与修改说明
          </summary>
          <div className="mt-3 space-y-3">
            {previousNotes.map(({ label, note }) => (
              <section key={label} className="space-y-1.5">
                <SectionHeading className="text-sm font-medium">{label}</SectionHeading>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {note}
                </p>
              </section>
            ))}
          </div>
        </details>
      )}

      <section aria-label="目标与验收要求" className="space-y-2">
        <SectionHeading className="text-sm font-semibold">目标与验收要求</SectionHeading>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {task.description || "尚未填写。编辑任务时可补充工作目标、交付内容与验收方式。"}
        </p>
      </section>

      <section aria-label="任务属性" className="space-y-3 border-t border-border pt-4">
        <SectionHeading className="text-sm font-semibold">任务属性</SectionHeading>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">负责人</dt>
            <dd className="mt-1 break-words [overflow-wrap:anywhere]">
              {task.assigneeName ?? "未认领"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">预计工时</dt>
            <dd className="mt-1 tabular-nums">
              {task.estimatedMinutes === null ? "未估算" : `${task.estimatedMinutes} 分钟`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">开始日期</dt>
            <dd className="mt-1 tabular-nums">{task.startDate ?? "未设置"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">截止日期</dt>
            <dd className="mt-1 tabular-nums">{task.dueDate ?? "未设置"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">关联里程碑</dt>
            <dd className="mt-1 break-words [overflow-wrap:anywhere]">
              {milestoneName || (task.milestoneId ? "已关联，可在独立详情页查看" : "暂未关联")}
            </dd>
          </div>
          {loggedMinutes !== undefined && (
            <div>
              <dt className="text-xs text-muted-foreground">已登记工时</dt>
              <dd className="mt-1 tabular-nums">{loggedMinutes} 分钟</dd>
            </div>
          )}
        </dl>
      </section>

      {subtasks !== undefined && !task.parentTaskId && (
        <section aria-label="子任务" className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading className="text-sm font-semibold">子任务</SectionHeading>
            <span className="text-xs tabular-nums text-muted-foreground">
              {subtasks.filter((subtask) => subtask.status === "accepted").length}/{subtasks.length} 已验收
            </span>
          </div>
          {subtasks.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {subtasks.map((subtask) => (
                <li key={subtask.id} className="flex items-start justify-between gap-3 p-3">
                  <Link
                    href={`/p/${task.projectId}/tasks/${subtask.id}`}
                    className="min-w-0 break-words text-sm text-brand hover:underline [overflow-wrap:anywhere]"
                  >
                    {subtask.title}
                  </Link>
                  <span className="shrink-0"><StatusPill status={subtask.status} /></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无子任务。</p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            全部子任务验收通过后，父任务才可验收。
          </p>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { z } from "zod";
import type { TaskDTO } from "@/modules/tasks";
import type { TeamRole } from "@/db/schema";
import { TaskActions, TaskDetailSummary, type AssigneeOption } from "@/modules/tasks/ui";
import { TaskAuditStream, type AuditEvent } from "./task-audit-stream";
import { FormFeedback } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { SubmissionTimeline } from "@/modules/review/ui";
import { TaskDiscussions } from "@/modules/discussions/ui";

const activitySchema = z.object({
  events: z.array(z.object({
    id: z.string().min(1), taskId: z.string().min(1), action: z.string().min(1),
    actorId: z.string().nullable().optional(), actorName: z.string().nullable().optional(),
    note: z.string().nullable().optional(), createdAt: z.iso.datetime({ offset: true }),
  })),
});

type TaskDrawerProps = {
  task: (TaskDTO & { projectName?: string; loggedMinutes?: number }) | null;
  role: TeamRole;
  actorId: string;
  isOpen: boolean;
  onClose: () => void;
  members?: AssigneeOption[];
  milestoneName?: string | null;
};

export function TaskDrawer({ task, role, actorId, isOpen, onClose, members, milestoneName }: TaskDrawerProps) {
  const [snapshot, setSnapshot] = useState<{ key: string; events: AuditEvent[]; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [discussionPending, setDiscussionPending] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const updatedAt = task?.updatedAt instanceof Date ? task.updatedAt.toISOString() : task?.updatedAt;
  const requestKey = `${actorId}:${task?.id}:${updatedAt}:${retry}`;
  const events = snapshot?.key === requestKey ? snapshot.events : [];
  const loading = isOpen && snapshot?.key !== requestKey;
  useEffect(() => {
    if (!isOpen || !task?.id) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/v1/tasks/${task?.id}/events`, { signal: controller.signal });
        if (!response.ok) throw new Error("任务活动暂时无法加载");
        const data: unknown = await response.json();
        const parsed = activitySchema.parse(data);
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, events: parsed.events });
      } catch {
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, events: [], error: "任务活动暂时无法加载，请重试。" });
      }
    }
    void load();
    return () => controller.abort();
  }, [isOpen, task?.id, requestKey]);

  if (!task) return null;
  const detailUrl = `/p/${task.projectId}/tasks/${task.id}`;
  const busy = actionPending || discussionPending;
  return <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
      <Dialog.Content aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}
        className="drawer-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-[660px] flex-col border-l border-border bg-card shadow-xl">
        <Dialog.Title className="sr-only">{task.title} · 任务详情</Dialog.Title>
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
          <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">{task.projectName || "任务详情"}</p><p className="text-xs text-muted-foreground">#{task.id.slice(0, 6)}</p></div>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="sm"><Link href={detailUrl} aria-disabled={busy} tabIndex={busy ? -1 : undefined} onClick={(event) => { if (busy) event.preventDefault(); }}>完整详情<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
            <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={busy} aria-label="关闭任务详情"><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <TaskDetailSummary task={task} milestoneName={milestoneName} loggedMinutes={task.loggedMinutes} />
          <SubmissionTimeline taskId={task.id} updatedAt={task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt)} compact />
          <TaskDiscussions taskId={task.id} projectId={task.projectId} actorId={actorId} onBusyChange={setDiscussionPending} />
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">任务活动{loading ? " · 加载中" : ` · ${events.length} 条`}</summary>
            <div className="mt-4">
              {snapshot?.key === requestKey && snapshot.error ? <div className="space-y-3"><FormFeedback message={snapshot.error} /><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>重新加载活动</Button></div> : loading ? <p role="status" className="text-sm text-muted-foreground">正在加载任务活动…</p> : <TaskAuditStream events={events} />}
            </div>
          </details>
          <p className="text-xs text-muted-foreground">完整详情可查看与编辑子任务、登记工时。</p>
        </div>
        <footer className="max-h-[35dvh] shrink-0 overflow-y-auto border-t border-border bg-card px-4 py-3 sm:px-6">
          <p className="mb-2 text-xs text-muted-foreground">按当前职务与任务状态显示操作</p>
          <TaskActions key={task.id} task={task} role={role} actorId={actorId} members={members} onPendingChange={setActionPending} />
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

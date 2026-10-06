"use client";

import { useActionState, useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import type { TaskDTO } from "./service";
import { editTaskAction } from "./actions";

export function EditTaskButton({
  task,
  milestones,
}: {
  task: TaskDTO;
  milestones: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4" />
          编辑任务
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-xs" />
        <Dialog.Content onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6">
          <div className="mb-5 flex justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">
                编辑任务
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                完善目标、排期与里程碑，协作者会看到最新信息。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="关闭编辑" disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <EditTaskForm
            task={task}
            milestones={milestones}
            onClose={() => setOpen(false)}
            onPendingChange={setBusy}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditTaskForm({
  task,
  milestones,
  onClose,
  onPendingChange,
}: {
  task: TaskDTO;
  milestones: { id: string; title: string }[];
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const id = useId();
  const notify = useFeedback();
  const [state, action, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof editTaskAction>>,
      data: FormData,
    ) => {
      const result = await editTaskAction(prev, data);
      if (result?.ok) { notify(result.ok); onClose(); }
      return result;
    },
    null,
  );
  useEffect(() => {
    onPendingChange(pending);
    return () => onPendingChange(false);
  }, [pending, onPendingChange]);
  const field = "space-y-1.5 text-sm";
  const select =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="space-y-4"
    >
      <input type="hidden" name="taskId" value={task.id} />
      <fieldset disabled={pending} className="space-y-4">
        <div className={field}>
          <label htmlFor={`${id}-title`}>任务标题</label>
          <Input
            id={`${id}-title`}
            name="title"
            defaultValue={task.title}
            maxLength={200}
            required
          />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-description`}>目标与验收要求</label>
          <textarea
            id={`${id}-description`}
            name="description"
            defaultValue={task.description ?? ""}
            rows={4}
            maxLength={10000}
            className={select}
            placeholder="说明需要完成的内容，以及如何确认完成…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor={`${id}-start`}>开始日期</label>
            <Input
              id={`${id}-start`}
              type="date"
              name="startDate"
              defaultValue={task.startDate ?? ""}
            />
          </div>
          <div className={field}>
            <label htmlFor={`${id}-due`}>截止日期</label>
            <Input
              id={`${id}-due`}
              type="date"
              name="dueDate"
              defaultValue={task.dueDate ?? ""}
            />
          </div>
          <div className={field}>
            <label htmlFor={`${id}-priority`}>优先级</label>
            <select
              id={`${id}-priority`}
              name="priority"
              defaultValue={task.priority}
              className={select}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>
          <div className={field}>
            <label htmlFor={`${id}-minutes`}>预计工时（分钟）</label>
            <Input
              id={`${id}-minutes`}
              type="number"
              name="estimatedMinutes"
              min={0}
              max={1000000}
              step={1}
              defaultValue={task.estimatedMinutes ?? ""}
            />
          </div>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-milestone`}>关联里程碑</label>
          <select
            id={`${id}-milestone`}
            name="milestoneId"
            defaultValue={task.milestoneId ?? ""}
            className={select}
          >
            <option value="">暂不关联</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        <FormFeedback message={state?.error} />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" loading={pending}>{pending ? "保存中…" : "保存修改"}</Button>
        </div>
      </fieldset>
    </form>
  );
}

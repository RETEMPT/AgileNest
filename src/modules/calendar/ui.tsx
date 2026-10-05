"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  calendarUrl,
  PRIORITY_META,
  type CalendarQuery,
  type ScheduleDTO,
} from "./client";
import { deleteScheduleAction, saveScheduleAction } from "./actions";

const dialogClass =
  "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl";

function ScheduleForm({
  schedule,
  date,
  onSaved,
  onCancel,
  onPendingChange,
}: {
  schedule?: ScheduleDTO;
  date: string;
  onSaved: (saved: ScheduleDTO) => void;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(saveScheduleAction, null);
  const [title, setTitle] = useState(schedule?.title ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [scheduleDate, setScheduleDate] = useState(
    schedule?.scheduleDate ?? date,
  );
  const [allDay, setAllDay] = useState(!schedule?.startTime);
  const [startTime, setStartTime] = useState(schedule?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(schedule?.endTime ?? "10:00");
  const [priority, setPriority] = useState(schedule?.priority ?? 0);
  const fieldId = useId();
  useEffect(() => {
    onPendingChange(pending);
    return () => onPendingChange(false);
  }, [pending, onPendingChange]);
  useEffect(() => {
    if (state?.saved) onSaved(state.saved);
  }, [state, onSaved]);
  return (
    <form action={formAction} className="mt-5 space-y-4">
      {schedule && (
        <>
          <input type="hidden" name="scheduleId" value={schedule.id} />
          <input type="hidden" name="version" value={schedule.version} />
        </>
      )}
      <fieldset disabled={pending} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-title`}>日程标题</Label>
          <Input
            id={`${fieldId}-title`}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={100}
            placeholder="例如：课题组讨论会"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-date`}>日期</Label>
            <Input
              id={`${fieldId}-date`}
              name="scheduleDate"
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              required
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
              onInput={(event) => setScheduleDate(event.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-priority`}>优先级</Label>
            <Select
              id={`${fieldId}-priority`}
              name="priority"
              value={priority}
              onChange={(event) =>
                setPriority(Number(event.target.value) as 0 | 1 | 2)
              }
            >
              {([0, 1, 2] as const).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_META[value].label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            name="allDay"
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          全天安排
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-start`}>开始时间</Label>
              <Input
                id={`${fieldId}-start`}
                name="startTime"
                type="time"
                required
                value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              onInput={(event) => setStartTime(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-end`}>结束时间</Label>
              <Input
                id={`${fieldId}-end`}
                name="endTime"
                type="time"
                required
                value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              onInput={(event) => setEndTime(event.currentTarget.value)}
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-description`}>说明</Label>
          <Textarea
            id={`${fieldId}-description`}
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="地点、准备事项或讨论内容"
          />
          <p className="text-right text-xs text-muted-foreground">
            {description.length}/500
          </p>
        </div>
      </fieldset>
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        时间按日程当天的本地钟表时间记录。保存个人安排不会创建或改变项目任务。
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          data-dialog-cancel
        >
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存日程"}
        </Button>
      </div>
    </form>
  );
}

function DeleteForm({
  schedule,
  onDeleted,
  onCancel,
  onPendingChange,
}: {
  schedule: ScheduleDTO;
  onDeleted: () => void;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    deleteScheduleAction,
    null,
  );
  useEffect(() => {
    onPendingChange(pending);
    return () => onPendingChange(false);
  }, [pending, onPendingChange]);
  useEffect(() => {
    if (state?.deleted) onDeleted();
  }, [state, onDeleted]);
  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="scheduleId" value={schedule.id} />
      <input type="hidden" name="version" value={schedule.version} />
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          data-dialog-cancel
        >
          取消
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "删除中…" : "确认删除"}
        </Button>
      </div>
    </form>
  );
}

export function ScheduleControls({
  query,
  schedule,
  mode,
  compact = false,
}: {
  query: CalendarQuery;
  schedule?: ScheduleDTO;
  mode: "create" | "manage";
  compact?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"save" | "delete" | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  function openDialog(kind: "save" | "delete", trigger: HTMLElement) {
    returnFocus.current = trigger;
    setNotice("");
    setDialog(kind);
  }
  const saved = useCallback(
    (item: ScheduleDTO) => {
      setDialog(null);
      setNotice("日程已保存");
      router.push(
        calendarUrl(query, {
          date: item.scheduleDate,
          year: Number(item.scheduleDate.slice(0, 4)),
          month: Number(item.scheduleDate.slice(5, 7)),
          q: "",
          priority: null,
        }),
      );
      router.refresh();
    },
    [query, router],
  );
  const deleted = useCallback(() => {
    setDialog(null);
    router.refresh();
  }, [router]);
  return (
    <div
      className={mode === "manage" ? "mt-3 border-t border-border pt-3" : ""}
    >
      {mode === "create" ? (
        <Button
          variant={compact ? "ghost" : "default"}
          size={compact ? "icon" : "default"}
          aria-label={compact ? "添加当日日程" : "新建日程"}
          onClick={(event) => openDialog("save", event.currentTarget)}
        >
          {compact ? (
            <Plus className="h-4 w-4" />
          ) : (
            <>
              <CalendarPlus className="h-4 w-4" />
              新建日程
            </>
          )}
        </Button>
      ) : (
        schedule && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`编辑日程：${schedule.title}`}
              onClick={(event) => openDialog("save", event.currentTarget)}
            >
              <Pencil className="h-3 w-3" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              aria-label={`删除日程：${schedule.title}`}
              onClick={(event) => openDialog("delete", event.currentTarget)}
            >
              <Trash2 className="h-3 w-3" />
              删除
            </Button>
          </div>
        )
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs text-brand">
          {notice}
        </p>
      )}
      {dialog && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open && !busy) setDialog(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
            <Dialog.Content
              ref={contentRef}
              className={dialogClass}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                contentRef.current
                  ?.querySelector<HTMLElement>(
                    dialog === "save"
                      ? 'input[name="title"]'
                      : "button[data-dialog-cancel]",
                  )
                  ?.focus();
              }}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (returnFocus.current?.isConnected)
                  returnFocus.current.focus();
                else document.getElementById("daily-schedule-title")?.focus();
              }}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <Dialog.Title className="text-lg font-semibold">
                {dialog === "delete"
                  ? "确认删除日程？"
                  : schedule
                    ? "编辑日程"
                    : "新建日程"}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                {dialog === "delete"
                  ? `“${schedule?.title}”将被删除，此操作无法撤销。`
                  : "日程仅本人可见，可安排全天事项或当天的起止时间。"}
              </Dialog.Description>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className="absolute right-3 top-3"
                  aria-label="关闭日程弹窗"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
              {dialog === "save" ? (
                <ScheduleForm
                  schedule={schedule}
                  date={query.date}
                  onSaved={saved}
                  onCancel={() => setDialog(null)}
                  onPendingChange={setBusy}
                />
              ) : (
                schedule && (
                  <DeleteForm
                    schedule={schedule}
                    onDeleted={deleted}
                    onCancel={() => setDialog(null)}
                    onPendingChange={setBusy}
                  />
                )
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bell, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { Label, Select } from "@/components/ui/input";
import { SCHEDULE_REMINDER_MINUTES, parseScheduleReminder, reminderMinutesLabel, scheduleReminderTime, type ScheduleDTO, type ScheduleReminderDTO, type ScheduleReminderMinutes } from "./client";

async function responseData(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "提醒设置暂时无法更新，请重试";
    throw new Error(error);
  }
  return body;
}

export function ReminderControls({ schedule }: { schedule: ScheduleDTO }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
    <Dialog.Trigger asChild><Button type="button" variant="ghost" size="sm" aria-label={`本人提醒设置：${schedule.title}`}><Bell aria-hidden="true" className="h-3 w-3" />本人提醒</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
      <Dialog.Title className="text-lg font-semibold">本人日程提醒</Dialog.Title>
      <Dialog.Description className="mt-2 pr-6 text-sm leading-6 text-muted-foreground">此设置和日程只属于你；团队管理员也无法读取。保存日程后可独立设置提醒。</Dialog.Description>
      <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="关闭本人提醒设置" disabled={pending}><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close>
      <ReminderEditor key={schedule.id} scheduleId={schedule.id} onPendingChange={setPending} onClose={() => setOpen(false)} />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function ReminderEditor({ scheduleId, onPendingChange, onClose }: { scheduleId: string; onPendingChange: (pending: boolean) => void; onClose: () => void }) {
  const [saved, setSaved] = useState<ScheduleReminderDTO | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState<ScheduleReminderMinutes>(15);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fieldId = useId();
  const active = useRef(false);
  const fetching = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const feedback = useFeedback();
  const load = useCallback(async (preserveSelection = false) => {
    if (!active.current || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    fetching.current = controller;
    setLoading(true);
    try {
      const next = parseScheduleReminder(await responseData(await fetch(`/api/v1/calendar/schedules/${scheduleId}/reminder`, { cache: "no-store", signal: controller.signal })));
      if (!next || next.scheduleId !== scheduleId) throw new Error("提醒设置无法读取，请重试");
      if (!active.current || controller.signal.aborted) return;
      setSaved(next);
      if (!preserveSelection) { setEnabled(next.enabled); setMinutes(next.minutes); }
      setError(""); setSuccess(preserveSelection ? "已读取最新日程和提醒版本，保留了当前选择；请核对新的时间后再保存。" : "");
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "提醒设置无法读取");
    } finally {
      if (active.current && fetching.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, [scheduleId]);
  useEffect(() => {
    active.current = true;
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void load(); });
    return () => { mounted = false; active.current = false; fetching.current?.abort(); writing.current?.abort(); };
  }, [load]);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  const dirty = saved && (saved.enabled !== enabled || saved.minutes !== minutes);
  const preview = saved ? scheduleReminderTime(saved, minutes) : null;
  const save = async () => {
    if (!saved || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    writing.current = controller;
    setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/v1/calendar/schedules/${scheduleId}/reminder`, { method: "PUT", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ scheduleVersion: saved.scheduleVersion, reminderVersion: saved.reminderVersion, enabled, minutes }) });
      const next = parseScheduleReminder(await responseData(response));
      if (!next || next.scheduleId !== scheduleId) throw new Error("保存结果无法确认，请读取最新版本");
      if (!active.current || controller.signal.aborted) return;
      setSaved(next); setEnabled(next.enabled); setMinutes(next.minutes); setSuccess(next.enabled ? "提醒已开启，将在你打开网站并查看协作消息时检查。" : "此日程提醒已关闭。");
      feedback(next.enabled ? "本人日程提醒已开启。" : "本人日程提醒已关闭。");
      window.dispatchEvent(new Event("agilenest:notifications-changed"));
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "提醒保存失败");
    } finally {
      writing.current = null;
      if (active.current) setPending(false);
    }
  };
  return <div className="mt-5 space-y-4">
    {saved && <div className="rounded-xl border border-border bg-muted/30 p-3.5"><p className="break-words text-sm font-medium">{saved.title}</p><p className="mt-1 text-xs text-muted-foreground">{saved.scheduleDate} · {saved.startTime ?? "全天，按 09:00 提醒"} · 北京时间</p></div>}
    {!saved && loading && <p role="status" className="text-sm text-muted-foreground">正在读取你的日程提醒…</p>}
    {saved && <fieldset disabled={loading || pending} className="space-y-4"><legend className="sr-only">本人日程提醒选项</legend><label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"><span><span className="block text-sm font-medium">开启站内提醒</span><span className="mt-1 block text-xs text-muted-foreground">到期时只发送到你的消息中心。</span></span><input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--brand)]" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSuccess(""); }} /></label><div className="space-y-2"><Label htmlFor={`${fieldId}-minutes`}>提醒时间</Label><Select id={`${fieldId}-minutes`} value={minutes} disabled={!enabled} onChange={(event) => { setMinutes(Number(event.target.value) as ScheduleReminderMinutes); setSuccess(""); }}>{SCHEDULE_REMINDER_MINUTES.map((value) => <option key={value} value={value}>{reminderMinutesLabel(value)}</option>)}</Select>{enabled && preview && <p className="text-xs text-muted-foreground">提醒时间：{new Date(preview).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}（北京时间）</p>}</div></fieldset>}
    <p className="rounded-lg bg-brand-soft/50 p-3 text-xs leading-6 text-muted-foreground">网站打开且页面可见时，小助手约每分钟检查；回到页面也会检查。关闭网站期间不会推送系统通知，重新进入后只补发提醒时间起 24 小时内的提醒。通知偏好中的“本人到期提醒”关闭时不产生消息。</p>
    <FormFeedback message={error} /><FormFeedback message={success} tone="success" />
    <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" disabled={loading || pending} onClick={() => void load(Boolean(dirty))}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{dirty ? "读取最新版本" : "重新加载"}</Button><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>关闭</Button><Button type="button" size="sm" disabled={!dirty || loading || pending} loading={pending} onClick={() => void save()}><Save aria-hidden="true" className="h-3.5 w-3.5" />保存提醒</Button></div></div>
  </div>;
}

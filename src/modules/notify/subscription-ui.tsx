"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { parseFollowState, parseNotificationPreferences, type FollowState, type FollowTarget, type NotificationPreferences } from "./client";
import { NOTIFICATIONS_CHANGED_EVENT } from "./dock";

export const FOLLOWS_CHANGED_EVENT = "agilenest:follows-changed";
async function readResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "设置暂时无法保存，请重试";
    throw new Error(message);
  }
  return body;
}

export function FollowButton({ target }: { target: FollowTarget }) {
  return <FollowControl key={`${target.kind}:${target.id}`} target={target} />;
}

function FollowControl({ target }: { target: FollowTarget }) {
  const [state, setState] = useState<FollowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const fetching = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const feedback = useFeedback();
  const load = useCallback(async () => {
    if (!active.current || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    fetching.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/notify/follows?kind=${target.kind}&id=${encodeURIComponent(target.id)}`, { cache: "no-store", signal: controller.signal });
      const next = parseFollowState(await readResponse(response));
      if (!next || next.target.id !== target.id || next.target.kind !== target.kind) throw new Error("关注设置无法读取，请重试");
      if (!active.current || controller.signal.aborted) return;
      setState(next); setError("");
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "关注设置无法读取");
    } finally {
      if (active.current && fetching.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, [target.id, target.kind]);
  useEffect(() => {
    active.current = true;
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void load(); });
    window.addEventListener(FOLLOWS_CHANGED_EVENT, load);
    return () => { mounted = false; active.current = false; fetching.current?.abort(); writing.current?.abort(); window.removeEventListener(FOLLOWS_CHANGED_EVENT, load); };
  }, [load]);
  const toggle = async () => {
    if (!state || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    writing.current = controller;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/v1/notify/follows", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...state, following: !state.following }), signal: controller.signal });
      const next = parseFollowState(await readResponse(response));
      if (!next || next.target.id !== target.id || next.target.kind !== target.kind) throw new Error("关注结果无法确认，请重新加载");
      if (!active.current || controller.signal.aborted) return;
      setState(next);
      feedback(next.following ? "已关注，后续更新按你的通知偏好提醒。" : "已取消关注，直接提及和与你有关的操作仍按通知偏好提醒。");
      window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "关注设置保存失败");
    } finally {
      writing.current = null;
      if (active.current) setPending(false);
    }
  };
  const name = target.kind === "project" ? "项目" : target.kind === "task" ? "任务" : "资料";
  return <div className="inline-flex max-w-full flex-col gap-2">
    <Button type="button" variant={state?.following ? "secondary" : "outline"} size="sm" disabled={loading || !state || pending} loading={loading || pending} aria-pressed={state?.following ?? false} aria-label={`${state?.following ? "取消关注" : "关注"}${name}`} title={state?.following ? "取消接收关注更新；直接提及与参与消息按偏好继续接收" : "关注此事项的后续更新"} onClick={() => void toggle()}>
      {state?.following ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Bell aria-hidden="true" className="h-3.5 w-3.5" />}{loading ? "读取关注…" : pending ? "保存中…" : state?.following ? "已关注" : "关注"}
    </Button>
    {error && <div className="max-w-xs space-y-1"><FormFeedback message={error} className="text-xs" /><Button type="button" size="sm" variant="ghost" disabled={pending || loading} onClick={() => void load()}><RefreshCw aria-hidden="true" className="h-3 w-3" />重新加载关注</Button></div>}
  </div>;
}

const preferenceRows: { key: Exclude<keyof NotificationPreferences, "version">; title: string; description: string }[] = [
  { key: "taskUpdates", title: "任务与验收", description: "指派、提交、验收以及你关注的任务更新。" },
  { key: "discussions", title: "讨论与内容评论", description: "任务讨论、回复和与你有关或你关注的资料评论。" },
  { key: "mentions", title: "直接 @ 提及", description: "成员在讨论或资料评论中明确提及你时提醒。" },
  { key: "resourceUpdates", title: "资料更新", description: "你关注的资料或项目内文档内容发生更新时提醒。" },
  { key: "reminders", title: "本人到期提醒", description: "已接入的任务到期与本人提醒；不包含他人的私人日程。" },
  { key: "showBubble", title: "协作中心浮动入口", description: "显示右下角统一的消息与 AI 草稿入口。关闭后消息继续接收，可从消息中心查看；AI 草稿仍可在完整工作区编辑。" },
];

export function NotificationPreferencesPanel({ compact = false }: { compact?: boolean }) {
  const [saved, setSaved] = useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const active = useRef(false);
  const fetching = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const feedback = useFeedback();
  const load = useCallback(async (preserveDraft = false) => {
    if (!active.current || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    fetching.current = controller;
    setLoading(true);
    try {
      const next = parseNotificationPreferences(await readResponse(await fetch("/api/v1/notify/preferences", { cache: "no-store", signal: controller.signal })));
      if (!next) throw new Error("通知偏好无法读取，请重试");
      if (!active.current || controller.signal.aborted) return;
      setSaved(next);
      if (!preserveDraft) setDraft(next);
      setError(""); setSuccess(preserveDraft ? "已读取最新版本，保留了当前选项；确认后可再次保存。" : "");
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "通知偏好无法读取");
    } finally {
      if (active.current && fetching.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void load(); });
    return () => { mounted = false; active.current = false; fetching.current?.abort(); writing.current?.abort(); };
  }, [load]);
  const dirty = Boolean(saved && draft && preferenceRows.some((row) => saved[row.key] !== draft[row.key]));
  const save = async () => {
    if (!saved || !draft || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    writing.current = controller;
    setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/v1/notify/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, version: saved.version }), signal: controller.signal });
      const next = parseNotificationPreferences(await readResponse(response));
      if (!next) throw new Error("设置保存结果无法确认，请重新加载");
      if (!active.current || controller.signal.aborted) return;
      setSaved(next); setDraft(next); setSuccess("通知偏好已保存，新通知将按这些选项处理。");
      feedback("通知偏好已保存。");
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "通知偏好保存失败");
    } finally {
      writing.current = null;
      if (active.current) setPending(false);
    }
  };
  return <section id="notification-preferences" aria-labelledby="notification-preferences-heading" className={`overflow-hidden rounded-2xl border border-border bg-card ${compact ? "" : "shadow-sm"}`}>
    <div className="flex items-start gap-3 border-b border-border p-5"><SlidersHorizontal aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><h2 id="notification-preferences-heading" className="font-semibold">通知偏好</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">设置仅属于当前账号，跨设备保存。关闭类别只影响后续新通知，历史消息仍可查看。</p></div></div>
    {loading && !draft && <p role="status" className="p-6 text-sm text-muted-foreground">正在读取你的通知偏好…</p>}
    {draft && <fieldset disabled={pending || loading} className="divide-y divide-border">
      <legend className="sr-only">接收哪些站内协作通知</legend>
      {preferenceRows.map((row) => <label key={row.key} className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{row.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{row.description}</span></span><input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--brand)]" checked={draft[row.key]} onChange={(event) => { const checked = event.target.checked; setDraft((value) => value ? { ...value, [row.key]: checked } : value); setSuccess(""); }} /></label>)}
    </fieldset>}
    <div className="space-y-3 border-t border-border bg-muted/20 p-5">
      <FormFeedback message={error} /><FormFeedback message={success} tone="success" />
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><BellOff aria-hidden="true" className="h-3.5 w-3.5" />当前为站内通知</p><div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" disabled={pending || loading} onClick={() => void load(dirty)}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{dirty ? "读取最新版本" : "重新加载"}</Button><Button type="button" size="sm" disabled={!dirty || pending || loading} loading={pending} onClick={() => void save()}><Save aria-hidden="true" className="h-3.5 w-3.5" />保存偏好</Button></div></div>
    </div>
  </section>;
}

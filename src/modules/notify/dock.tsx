"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Clock3, RefreshCw, ArrowUpRight, Inbox, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/feedback";
import { notificationCategoryFor, notificationLabel, notificationTarget, parseNotificationFeed, type NotificationCategory, type NotificationFeed } from "./client";

export const NOTIFICATIONS_CHANGED_EVENT = "agilenest:notifications-changed";

async function responseBody(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = value && typeof value === "object" && "error" in value && typeof value.error === "string"
      ? value.error : "消息暂时无法更新，请重试";
    throw new Error(message);
  }
  return value;
}

export function useNotificationFeed() {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const active = useRef(false);
  const fetching = useRef<AbortController | null>(null);
  const mutating = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!active.current || mutating.current) return;
    fetching.current?.abort();
    const controller = new AbortController();
    fetching.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/v1/notify?summary=1", { cache: "no-store", signal: controller.signal });
      const next = parseNotificationFeed(await responseBody(response));
      if (!next) throw new Error("暂时无法读取消息，请刷新重试");
      if (controller.signal.aborted || !active.current) return;
      setFeed(next); setError(""); setUpdatedAt(new Date());
    } catch (caught) {
      if (!controller.signal.aborted && active.current) setError(caught instanceof Error ? caught.message : "消息暂时无法更新，请重试");
    } finally {
      if (fetching.current === controller && !controller.signal.aborted && active.current) setLoading(false);
    }
  }, []);

  const mark = useCallback(async (id: string | "all") => {
    if (!active.current || mutating.current) return false;
    fetching.current?.abort();
    const controller = new AbortController();
    mutating.current = controller;
    setPendingId(id); setLoading(false); setError("");
    let succeeded = false;
    try {
      const query = id === "all" ? "all=1" : `id=${encodeURIComponent(id)}`;
      await responseBody(await fetch(`/api/v1/notify?${query}`, { method: "POST", signal: controller.signal }));
      succeeded = true;
    } catch (caught) {
      if (!controller.signal.aborted && active.current) setError(caught instanceof Error ? caught.message : "消息暂时无法更新，请重试");
    } finally {
      mutating.current = null;
      if (active.current) setPendingId(null);
    }
    if (succeeded && active.current) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    return succeeded;
  }, []);

  useEffect(() => {
    active.current = true;
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    visibleRefresh();
    const timer = window.setInterval(visibleRefresh, 60000);
    window.addEventListener("focus", visibleRefresh);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      fetching.current?.abort(); mutating.current?.abort();
    };
  }, [refresh]);
  return { feed, loading, error, updatedAt, pendingId, refresh, mark };
}

export function NotificationDockPanel({ state, onNavigate }: {
  state: ReturnType<typeof useNotificationFeed>;
  onNavigate: () => void;
}) {
  const { feed, loading, error, updatedAt, pendingId, refresh, mark } = state;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const categories: { value: NotificationCategory | "all"; label: string }[] = [
    { value: "all", label: "全部类型" },
    { value: "taskUpdates", label: "任务与验收" },
    { value: "discussions", label: "讨论与评论" },
    { value: "mentions", label: "直接 @ 提及" },
    { value: "resourceUpdates", label: "资料更新" },
    { value: "reminders", label: "到期提醒" },
  ];
  const visible = feed?.notifications.filter((item) => (!unreadOnly || !item.readAt) && (category === "all" || notificationCategoryFor(item.type) === category)) ?? [];
  const filtered = unreadOnly || category !== "all";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p role="status" className="text-sm font-medium">{feed ? feed.unreadCount ? `${feed.unreadCount} 条未读消息` : "协作消息已读完" : loading ? "正在读取消息" : "暂未读取消息"}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 aria-hidden="true" className="h-3 w-3" />{updatedAt ? `更新于 ${updatedAt.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })}` : "尚未获取最新消息"}</p>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="刷新协作消息" disabled={loading || Boolean(pendingId)} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button type="button" variant="outline" size="sm" disabled={!feed?.unreadCount || loading || Boolean(pendingId)} loading={pendingId === "all"} onClick={() => void mark("all")}><CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />全部已读</Button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/15 px-4 py-2.5">
        <Button type="button" size="sm" variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)} className="gap-1.5 px-2"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${unreadOnly ? "bg-brand" : "bg-muted-foreground/50"}`} />仅看未读</Button>
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="sr-only">筛选消息类型</span><select value={category} onChange={(event) => { const value = categories.find((item) => item.value === event.target.value)?.value; if (value) setCategory(value); }} className="min-h-8 max-w-40 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error && <div className="m-3"><FormFeedback message={`${error}${updatedAt ? "；下方保留上次读取的消息。" : ""}`} /></div>}
        {!feed && loading && <div role="status" className="space-y-5 p-4"><span className="sr-only">正在读取你的协作消息…</span>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="flex animate-pulse gap-3"><div className="h-8 w-8 shrink-0 rounded-xl bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-3/5 rounded bg-muted" /><div className="h-2.5 w-full rounded bg-muted" /><div className="h-2.5 w-4/5 rounded bg-muted" /></div></div>)}</div>}
        {feed?.notifications.length === 0 && <div className="px-6 py-12 text-center"><Bell aria-hidden="true" className="mx-auto h-8 w-8 text-brand/40" /><h3 className="mt-3 text-sm font-semibold">暂时没有协作消息</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">任务分配、成果提交与验收等已接入的站内消息会显示在这里。</p></div>}
        {feed && feed.notifications.length > 0 && visible.length === 0 && <div className="px-6 py-10 text-center"><Inbox aria-hidden="true" className="mx-auto h-8 w-8 text-brand/40" /><h3 className="mt-3 text-sm font-semibold">最近消息中没有匹配内容</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">这里筛选最近 20 条消息。更早的未读内容可在消息中心查看。</p>{filtered && <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => { setUnreadOnly(false); setCategory("all"); }}>清除筛选</Button>}</div>}
        {visible.length > 0 && <ul className="divide-y divide-border">
          {visible.map((item) => {
            const href = notificationTarget(item.link);
            return <li key={item.id} className={`px-4 py-4 transition-colors hover:bg-muted/30 ${!item.readAt ? "bg-brand-soft/35" : ""}`}>
              <div className="flex gap-2.5"><span aria-label={item.readAt ? "已读" : "未读"} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-brand"}`} /><div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-md bg-brand/5 px-1.5 py-0.5 text-[11px] font-medium text-brand">{notificationLabel(item.type)}</span><time dateTime={item.createdAt} className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>
                <h3 className="mt-1.5 break-words text-sm font-semibold">{href ? <Link href={href} className="underline-offset-4 hover:text-brand hover:underline" onClick={() => { if (!item.readAt) void mark(item.id); onNavigate(); }}>{item.title}</Link> : item.title}</h3>
                {item.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{item.body}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{href && <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline" onClick={() => { if (!item.readAt) void mark(item.id); onNavigate(); }}>打开相关内容<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}{!item.readAt && <Button type="button" size="sm" variant="ghost" disabled={Boolean(pendingId)} loading={pendingId === item.id} onClick={() => void mark(item.id)}>标为已读</Button>}</div>
              </div></div>
            </li>;
          })}
        </ul>}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 px-4 py-3"><div className="flex items-center gap-2"><Button asChild variant="outline" className="min-w-0 flex-1"><Link href={unreadOnly ? "/notifications?unread=1" : "/notifications"} onClick={onNavigate}>进入消息中心<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></Button><Button asChild variant="ghost" size="icon" aria-label="设置通知偏好"><Link href="/notifications#notification-preferences" onClick={onNavigate}><SlidersHorizontal aria-hidden="true" className="h-4 w-4" /></Link></Button></div><p className="text-center text-[10px] leading-4 text-muted-foreground">最近 20 条消息 · 未读数字包含全部历史消息 · 回到页面时更新</p></div>
    </div>
  );
}

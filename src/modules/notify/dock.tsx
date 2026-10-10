"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Clock3, RefreshCw, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/feedback";
import { notificationLabel, notificationTarget, parseNotificationFeed, type NotificationFeed } from "./client";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">{feed ? `${feed.unreadCount} 条未读消息` : "正在读取消息"}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 aria-hidden="true" className="h-3 w-3" />{updatedAt ? `更新于 ${updatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "尚未获取最新消息"}</p>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="刷新协作消息" disabled={loading || Boolean(pendingId)} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button type="button" variant="outline" size="sm" disabled={!feed?.unreadCount || loading || Boolean(pendingId)} loading={pendingId === "all"} onClick={() => void mark("all")}><CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />全部已读</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error && <div className="m-3"><FormFeedback message={`${error}${updatedAt ? "；下方保留上次读取的消息。" : ""}`} /></div>}
        {!feed && loading && <p role="status" className="p-8 text-center text-sm text-muted-foreground">正在读取你的协作消息…</p>}
        {feed?.notifications.length === 0 && <div className="px-6 py-12 text-center"><Bell aria-hidden="true" className="mx-auto h-8 w-8 text-brand/40" /><h3 className="mt-3 text-sm font-semibold">暂时没有协作消息</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">任务分配、成果提交与验收等已接入的站内消息会显示在这里。</p></div>}
        {feed && feed.notifications.length > 0 && <ul className="divide-y divide-border">
          {feed.notifications.map((item) => {
            const href = notificationTarget(item.link);
            return <li key={item.id} className={`px-4 py-4 ${!item.readAt ? "bg-brand-soft/35" : ""}`}>
              <div className="flex gap-2.5"><span aria-label={item.readAt ? "已读" : "未读"} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-brand"}`} /><div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-medium text-brand">{notificationLabel(item.type)}</span><time dateTime={item.createdAt} className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>
                <h3 className="mt-1.5 break-words text-sm font-semibold">{href ? <Link href={href} className="underline-offset-4 hover:text-brand hover:underline" onClick={() => { if (!item.readAt) void mark(item.id); onNavigate(); }}>{item.title}</Link> : item.title}</h3>
                {item.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{item.body}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{href && <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline" onClick={() => { if (!item.readAt) void mark(item.id); onNavigate(); }}>打开相关内容<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}{!item.readAt && <Button type="button" size="sm" variant="ghost" disabled={Boolean(pendingId)} loading={pendingId === item.id} onClick={() => void mark(item.id)}>标为已读</Button>}</div>
              </div></div>
            </li>;
          })}
        </ul>}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 px-4 py-3"><Button asChild variant="outline" className="w-full"><Link href="/notifications" onClick={onNavigate}>进入消息中心<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></Button><p className="text-center text-[10px] leading-4 text-muted-foreground">更多历史消息请前往消息中心 · 回到页面时自动更新</p></div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bell, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDockPanel, useNotificationFeed } from "@/modules/notify/ui";
import { AiWorkspace } from "./workspace";

const OPEN_EVENT = "agilenest:open-ai-floating";
export function openAiFloating() { window.dispatchEvent(new Event(OPEN_EVENT)); }

function CollaborationBot() {
  return <svg aria-hidden="true" viewBox="0 0 64 64" className="h-9 w-9 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5">
    <path d="M32 15V9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="7" r="4" fill="var(--brand-accent)" />
    <rect x="11" y="17" width="42" height="34" rx="13" fill="currentColor" />
    <rect x="16" y="22" width="32" height="23" rx="9" fill="var(--card)" />
    <rect x="24" y="29" width="4" height="7" rx="2" fill="currentColor" />
    <rect x="36" y="29" width="4" height="7" rx="2" fill="currentColor" />
    <path d="M28 39c2.5 2 5.5 2 8 0" fill="none" stroke="var(--brand-accent)" strokeWidth="2" strokeLinecap="round" />
    <path d="M8 28v9M56 28v9M23 54h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}

export function CollaborationDock({ userId, projects, aiEnabled = true }: {
  userId: string;
  projects: { id: string; name: string; teamName: string }[];
  aiEnabled?: boolean;
}) {
  const state = useNotificationFeed();
  const [panel, setPanel] = useState<"notifications" | "ai" | null>(null);
  const [dismissed, setDismissed] = useState("");
  const panelRef = useRef<typeof panel>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const botRef = useRef<HTMLButtonElement | null>(null);
  const saveGuardRef = useRef<(() => boolean) | null>(null);
  const blockedRef = useRef(false);
  const guarded = useCallback(() => {
    if (!saveGuardRef.current || saveGuardRef.current()) { blockedRef.current = false; return true; }
    if (!blockedRef.current) { blockedRef.current = true; return false; }
    blockedRef.current = false;
    return true;
  }, []);
  const changePanel = useCallback((next: typeof panel) => {
    if (panelRef.current === "ai" && next !== "ai" && !guarded()) return;
    if (next && !panelRef.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current = next;
    setPanel(next);
  }, [guarded]);
  useEffect(() => {
    const show = () => { if (aiEnabled) changePanel("ai"); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [aiEnabled, changePanel]);
  const count = state.feed?.unreadCount;
  const notice = state.feed?.notifications.find((item) => !item.readAt);
  const bubbleKey = `${count}:${state.feed?.notifications[0]?.id ?? ""}`;
  const showBubble = Boolean(count && !panel && dismissed !== bubbleKey);
  return <>
    <div data-collaboration-dock className="fixed z-40 flex items-end gap-2" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))", right: "calc(1rem + env(safe-area-inset-right))" }}>
      {showBubble && <div className="absolute bottom-17 right-0 w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-brand/20 bg-card p-3 shadow-lg">
        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="收起消息提醒" onClick={() => setDismissed(bubbleKey)}><X aria-hidden="true" className="h-3 w-3" /></Button>
        <button type="button" className="block w-full rounded-lg pr-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" onClick={() => { changePanel("notifications"); void state.refresh(); }}><span className="block text-xs font-semibold text-brand">有 {count} 条未读协作消息</span><span className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{notice?.title ?? "打开消息中心查看未读内容"}</span></button>
      </div>}
      <Button ref={botRef} type="button" aria-label={count === undefined ? "打开协作消息" : `打开协作消息，${count} 条未读`} aria-haspopup="dialog" aria-expanded={panel === "notifications"} title="协作小助手" variant="outline" className="group relative h-14 w-14 rounded-2xl border-brand/20 bg-card p-0 text-brand shadow-lg transition-[transform,box-shadow] duration-200 hover:border-brand/40 hover:bg-brand-soft hover:shadow-xl motion-safe:hover:-translate-y-0.5" onClick={() => { changePanel(panel === "notifications" ? null : "notifications"); if (panel !== "notifications") void state.refresh(); }}><CollaborationBot />{count !== undefined && count > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span>}</Button>
      {aiEnabled && <Button type="button" size="icon" variant="outline" aria-label="打开 AI 悬浮窗" aria-haspopup="dialog" aria-expanded={panel === "ai"} title="AI 本地草稿" className="h-10 w-10 rounded-xl border-brand/20 bg-card text-brand shadow-md" onClick={() => changePanel(panel === "ai" ? null : "ai")}><MessageSquare aria-hidden="true" className="h-4 w-4" /></Button>}
    </div>
    <Dialog.Root modal={false} open={panel !== null} onOpenChange={(next) => { if (!next) changePanel(null); }}>
      <Dialog.Portal><Dialog.Content onInteractOutside={(event) => { const target = event.detail.originalEvent.target; if (panel === "ai" || (target instanceof Element && target.closest("[data-collaboration-dock]"))) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : botRef.current)?.focus(); }} className="dialog-surface fixed z-40 flex w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-brand/20 bg-card shadow-2xl" style={{ height: "min(580px, calc(100dvh - 7rem - env(safe-area-inset-bottom)))", bottom: "calc(5.5rem + env(safe-area-inset-bottom))", right: "calc(1rem + env(safe-area-inset-right))" }}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"><div><Dialog.Title className="flex items-center gap-2 text-sm font-semibold"><Bell aria-hidden="true" className="h-4 w-4 text-brand" />协作小助手</Dialog.Title><Dialog.Description className="mt-1 text-[11px] text-muted-foreground">{panel === "ai" ? "继续整理你的本地 AI 草稿" : "及时了解任务与成果的协作进展"}</Dialog.Description></div><div className="flex gap-1">{panel === "ai" && <Button asChild size="icon" variant="ghost" aria-label="打开完整 AI 工作区"><Link href="/ai" onClick={(event) => { if (!guarded()) { event.preventDefault(); return; } panelRef.current = null; setPanel(null); }}><ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></Button>}<Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="收起协作小助手"><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close></div></div>
        <div className="flex shrink-0 gap-1 border-b border-border bg-muted/25 px-3 py-2"><Button type="button" size="sm" variant={panel === "notifications" ? "secondary" : "ghost"} aria-pressed={panel === "notifications"} onClick={() => changePanel("notifications")}><Bell aria-hidden="true" className="h-3.5 w-3.5" />协作消息{count !== undefined && count > 0 ? ` · ${count}` : ""}</Button>{(aiEnabled || panel === "ai") && <Button type="button" size="sm" variant={panel === "ai" ? "secondary" : "ghost"} aria-pressed={panel === "ai"} onClick={() => changePanel("ai")}><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />AI 草稿</Button>}</div>
        {panel === "ai" ? <AiWorkspace userId={userId} projects={projects} compact saveGuardRef={saveGuardRef} /> : <NotificationDockPanel state={state} onNavigate={() => changePanel(null)} />}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}

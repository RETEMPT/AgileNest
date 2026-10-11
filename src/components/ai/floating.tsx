"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowUpRight, Bell, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDockPanel, useNotificationFeed } from "@/modules/notify/ui";
import { AiWorkspace } from "./workspace";

const OPEN_EVENT = "agilenest:open-collaboration-dock";
const LEGACY_AI_EVENT = "agilenest:open-ai-floating";
type DockPanel = "notifications" | "ai";

export function openCollaborationDock(panel: DockPanel = "notifications") {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panel }));
}
export function openAiFloating() { openCollaborationDock("ai"); }

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

type DockProps = {
  userId: string;
  projects: { id: string; name: string; teamName: string }[];
  aiEnabled?: boolean;
};

export function CollaborationDock(props: DockProps) {
  return <AccountCollaborationDock key={props.userId} {...props} />;
}

function AccountCollaborationDock({ userId, projects, aiEnabled = true }: DockProps) {
  const state = useNotificationFeed();
  const refresh = state.refresh;
  const [panel, setPanel] = useState<DockPanel | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [blockedByImport, setBlockedByImport] = useState(false);
  const [previewInteraction, setPreviewInteraction] = useState(0);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewClock = useRef({ key: "", remainingMs: 8000 });
  const panelRef = useRef<DockPanel | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const botRef = useRef<HTMLButtonElement | null>(null);
  const panelFocus = useRef<HTMLButtonElement | null>(null);
  const aiFocus = useRef<HTMLButtonElement | null>(null);
  const saveGuardRef = useRef<(() => boolean) | null>(null);
  const aiBusyRef = useRef(false);
  const panelId = useId();
  const count = state.feed?.unreadCount;
  const notice = state.feed?.notifications.find((item) => !item.readAt);
  const bubbleKey = `${count}:${notice?.id ?? ""}`;
  const dockVisible = state.feed?.preferences?.showBubble !== false;
  const guarded = useCallback(() => {
    const saved = saveGuardRef.current?.() ?? true;
    setSaveBlocked(!saved);
    setBlockedByImport(aiBusyRef.current);
    return saved;
  }, []);
  const changePanel = useCallback((next: DockPanel | null) => {
    if (panelRef.current === "ai" && next !== "ai" && !guarded()) return;
    if (next && !panelRef.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (next) setDismissed(bubbleKey);
    panelRef.current = next;
    setPanel(next);
    setSaveBlocked(false);
  }, [bubbleKey, guarded]);
  useEffect(() => {
    const show = (event: Event) => {
      const requested = event instanceof CustomEvent && event.detail === "ai" ? "ai" : "notifications";
      if (requested === "ai" && !aiEnabled) return;
      changePanel(requested);
      if (requested === "notifications") void refresh();
    };
    const showLegacyAi = () => { if (aiEnabled) changePanel("ai"); };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener(LEGACY_AI_EVENT, showLegacyAi);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener(LEGACY_AI_EVENT, showLegacyAi);
    };
  }, [aiEnabled, changePanel, refresh]);
  const showPreview = Boolean(dockVisible && count && !panel && dismissed !== bubbleKey);
  useEffect(() => {
    if (!showPreview) return;
    if (previewClock.current.key !== bubbleKey) previewClock.current = { key: bubbleKey, remainingMs: 8000 };
    const preview = previewRef.current;
    if (preview && (preview.matches(":hover") || preview.contains(document.activeElement))) return;
    const clock = previewClock.current;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      clock.remainingMs = 0;
      setDismissed(bubbleKey);
    }, clock.remainingMs);
    return () => {
      window.clearTimeout(timer);
      clock.remainingMs = Math.max(0, clock.remainingMs - (performance.now() - startedAt));
    };
  }, [bubbleKey, previewInteraction, showPreview]);
  const openLabel = count === undefined ? "打开协作中心" : `打开协作中心，${count} 条未读消息`;
  return <>
    {dockVisible && <div data-collaboration-dock className="fixed z-40" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))", right: "calc(1rem + env(safe-area-inset-right))" }}>
      {showPreview && <div ref={previewRef} onMouseEnter={() => setPreviewInteraction((value) => value + 1)} onMouseLeave={() => setPreviewInteraction((value) => value + 1)} onFocusCapture={() => setPreviewInteraction((value) => value + 1)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewInteraction((value) => value + 1); }} className="panel-enter absolute bottom-17 right-0 w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-brand/20 bg-card p-3 shadow-lg">
        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="收起消息预览" onClick={() => setDismissed(bubbleKey)}><X aria-hidden="true" className="h-3 w-3" /></Button>
        <button type="button" className="block w-full rounded-lg pr-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" onClick={() => { changePanel("notifications"); void state.refresh(); }}><span className="block text-xs font-semibold text-brand">有 {count} 条未读协作消息</span><span className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{notice?.title ?? "打开协作中心查看未读内容"}</span></button>
      </div>}
      <Button ref={botRef} type="button" aria-label={openLabel} aria-haspopup="dialog" aria-expanded={panel !== null} aria-controls={panel ? panelId : undefined} title="协作中心 · 消息与本地草稿" variant="outline" className="group relative h-14 w-14 rounded-2xl border-brand/20 bg-card p-0 text-brand shadow-lg transition-[transform,box-shadow] duration-200 hover:border-brand/40 hover:bg-brand-soft hover:shadow-xl motion-safe:hover:-translate-y-0.5" onClick={() => { changePanel(panel ? null : "notifications"); if (!panel) void state.refresh(); }}><CollaborationBot />{count !== undefined && count > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span>}</Button>
    </div>}
    <Dialog.Root modal={false} open={panel !== null} onOpenChange={(next) => { if (!next) changePanel(null); }}>
      <Dialog.Portal><Dialog.Content id={panelId} onOpenAutoFocus={(event) => { event.preventDefault(); (panelRef.current === "ai" ? aiFocus.current : panelFocus.current)?.focus(); }} onInteractOutside={(event) => { const target = event.detail.originalEvent.target; if (panel === "ai" || (target instanceof Element && target.closest("[data-collaboration-dock]"))) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); const target = returnFocus.current?.isConnected ? returnFocus.current : botRef.current; if (target?.isConnected) target.focus(); }} className="dialog-surface fixed z-40 flex w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-brand/20 bg-card shadow-2xl" style={{ height: "min(640px, calc(100dvh - 7rem - env(safe-area-inset-bottom)))", bottom: "calc(5.5rem + env(safe-area-inset-bottom))", right: "calc(1rem + env(safe-area-inset-right))" }}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="min-w-0"><Dialog.Title className="flex items-center gap-2 text-sm font-semibold"><Bell aria-hidden="true" className="h-4 w-4 text-brand" />协作中心</Dialog.Title><Dialog.Description className="mt-1 text-[11px] text-muted-foreground">任务、资料与提醒集中查看，继续整理本地草稿</Dialog.Description></div><div className="flex shrink-0 gap-1">{panel === "ai" && <Button asChild size="icon" variant="ghost" aria-label="打开完整 AI 工作区"><Link href="/ai" onClick={(event) => { if (!guarded()) { event.preventDefault(); return; } changePanel(null); }}><ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></Button>}<Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="收起协作中心"><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close></div></div>
        <Tabs.Root value={panel ?? "notifications"} onValueChange={(next) => { if (next === "notifications" || next === "ai") changePanel(next); }} className="flex min-h-0 flex-1 flex-col">
          <Tabs.List aria-label="协作中心内容" className="flex shrink-0 gap-1 border-b border-border bg-muted/25 px-3 py-2">
            <Tabs.Trigger ref={panelFocus} value="notifications" className="ui-button flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-brand-soft data-[state=active]:font-semibold data-[state=active]:text-brand"><Bell aria-hidden="true" className="h-3.5 w-3.5" />协作消息{count !== undefined && count > 0 && <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] tabular-nums">{count > 99 ? "99+" : count}</span>}</Tabs.Trigger>
            {(aiEnabled || panel === "ai") && <Tabs.Trigger ref={aiFocus} value="ai" className="ui-button flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-brand-soft data-[state=active]:font-semibold data-[state=active]:text-brand"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />AI 草稿</Tabs.Trigger>}
          </Tabs.List>
          {saveBlocked && <div role="alert" className="shrink-0 space-y-2 border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"><p>草稿或附件尚未保存，当前内容已保留。请等待附件完成，或复制内容、重试保存后再收起或切换。</p>{!blockedByImport && <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-destructive" onClick={() => setDiscardConfirm(true)}>放弃未保存输入并收起…</Button>}</div>}
          <Tabs.Content value="notifications" tabIndex={-1} className="panel-enter flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"><NotificationDockPanel state={state} onNavigate={() => changePanel(null)} /></Tabs.Content>
          <Tabs.Content value="ai" tabIndex={-1} className="panel-enter flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"><AiWorkspace userId={userId} projects={projects} compact saveGuardRef={saveGuardRef} busyRef={aiBusyRef} /></Tabs.Content>
        </Tabs.Root>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={discardConfirm} onOpenChange={setDiscardConfirm}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-80 bg-black/35" /><Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); if (panelRef.current === "ai") document.getElementById(panelId)?.querySelector<HTMLTextAreaElement>("textarea")?.focus(); else (returnFocus.current?.isConnected ? returnFocus.current : botRef.current)?.focus(); }} className="dialog-surface fixed left-1/2 top-1/2 z-80 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"><Dialog.Title className="font-semibold">放弃本次未保存输入？</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">请先复制需要保留的文字。确认后收起当前编辑，已保存的草稿、记录和附件会继续保留。</Dialog.Description><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDiscardConfirm(false)}>继续编辑</Button><Button type="button" variant="destructive" onClick={() => { if (aiBusyRef.current) return; panelRef.current = null; setPanel(null); setSaveBlocked(false); setDiscardConfirm(false); }}>放弃并收起</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

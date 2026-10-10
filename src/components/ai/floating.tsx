"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiWorkspace } from "./workspace";

const OPEN_EVENT = "agilenest:open-ai-floating";
export function openAiFloating() { window.dispatchEvent(new Event(OPEN_EVENT)); }

export function AiFloating({ userId, projects }: { userId: string; projects: {id:string;name:string;teamName:string}[] }) {
  const [open, setOpen] = useState(false);
  const saveGuardRef = useRef<(() => boolean) | null>(null);
  // A failed save blocks leaving once to protect the text, then lets the user out instead of trapping them.
  const blockedRef = useRef(false);
  const guarded = () => {
    if (!saveGuardRef.current || saveGuardRef.current()) { blockedRef.current = false; return true; }
    if (!blockedRef.current) { blockedRef.current = true; return false; }
    blockedRef.current = false;
    return true;
  };
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  return <Dialog.Root modal={false} open={open} onOpenChange={(next) => {
    if (!next && !guarded()) return;
    setOpen(next);
  }}>
    <Dialog.Trigger asChild><Button size="icon" aria-label="打开 AI 悬浮窗" title="AI 草稿" className="fixed right-5 bottom-5 z-40 h-11 w-11 rounded-full border border-brand/20 shadow-lg"><MessageSquare size={20} /></Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content onInteractOutside={(event) => event.preventDefault()} className="dialog-surface fixed right-3 bottom-3 z-60 flex h-[min(580px,calc(100dvh-2rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:right-5 sm:bottom-5">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5"><div><Dialog.Title className="text-sm font-semibold">AI 悬浮窗</Dialog.Title><Dialog.Description className="mt-0.5 text-[11px] text-muted-foreground">继续编辑当前本地草稿</Dialog.Description></div><div className="flex gap-1"><Button asChild size="icon" variant="ghost" aria-label="打开完整 AI 工作区"><Link href="/ai" onClick={(event) => {
        if (!guarded()) { event.preventDefault(); return; }
        setOpen(false);
      }}><ArrowUpRight size={17} /></Link></Button><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="收起 AI 悬浮窗"><X size={17} /></Button></Dialog.Close></div></div>
      <AiWorkspace userId={userId} projects={projects} compact saveGuardRef={saveGuardRef} />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

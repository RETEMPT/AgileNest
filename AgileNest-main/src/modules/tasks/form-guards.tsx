"use client";

import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

export function DiscardChangesDialog({ open, onKeepEditing, onDiscard }: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onKeepEditing(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-black/40" />
      <Dialog.Content
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}
        className="dialog-surface fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <Dialog.Title className="text-lg font-semibold">放弃未提交内容？</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">关闭后，本次填写的说明、证据选择与逐项结果会被放弃。</Dialog.Description>
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onKeepEditing}>继续编辑</Button><Button type="button" variant="destructive" onClick={onDiscard}>放弃并关闭</Button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

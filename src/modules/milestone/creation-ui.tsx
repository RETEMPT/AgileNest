"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTaskForm, MilestoneForm } from "@/modules/tasks/ui";

export type MilestoneCreation = { kind: "milestone" } | { kind: "task"; milestoneId?: string; parentTaskId?: string; context: string };

export function MilestoneAddCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand/35 bg-card p-4 text-center text-brand hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="h-5 w-5" aria-hidden="true" /><span className="text-sm font-medium">{title}</span><span className="text-xs font-normal text-muted-foreground">{description}</span></button>;
}

export function MilestoneCreationDialog({ projectId, creation, onClose }: { projectId: string; creation: MilestoneCreation; onClose: () => void }) {
  const router = useRouter();
  const returnFocus = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const title = creation.kind === "milestone" ? "新建里程碑" : creation.parentTaskId ? "新增子任务" : "新建模块 / 任务";
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, pending]);
  const close = () => { if (pending) return; if (dirty) setDiscard(true); else onClose(); };
  const created = () => { setDirty(false); onClose(); router.refresh(); };
  return <><Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40" /><Dialog.Content onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-1 break-words text-sm text-muted-foreground">{creation.kind === "milestone" ? "设置阶段目标与日期，创建后再添加工作任务。" : `${creation.context} · ${creation.parentTaskId ? "新任务将归入此模块和阶段。" : "新增主任务，继续拆分子任务后即作为模块展示。"}`}</Dialog.Description></div><Button type="button" size="icon" variant="ghost" disabled={pending} onClick={close} aria-label="关闭新建窗口"><X className="h-4 w-4" /></Button></div><div onChangeCapture={() => setDirty(true)}>{creation.kind === "milestone" ? <MilestoneForm projectId={projectId} onCreated={created} onPendingChange={setPending} /> : <CreateTaskForm projectId={projectId} milestoneId={creation.milestoneId} parentTaskId={creation.parentTaskId} onCreated={created} onPendingChange={setPending} />}</div><div className="mt-3 flex justify-end"><Button type="button" variant="outline" disabled={pending} onClick={close}>取消</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={discard} onOpenChange={setDiscard}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-black/40" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-[60] w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"><Dialog.Title className="text-lg font-semibold">放弃未提交内容？</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">关闭后，本次填写的名称、目标和验收要求不会保存。</Dialog.Description><div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="destructive" onClick={onClose}>放弃并关闭</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}

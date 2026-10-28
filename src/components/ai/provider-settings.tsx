"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { Check, Pencil, PlugZap, Plus, RefreshCw, Server, Square, Trash2, X } from "lucide-react";
import { modelProviderListSchema, type ModelConfiguration, type ModelProviderList } from "@/modules/ai/client";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/feedback";
import { ConnectionForm, initialModelConfiguration } from "./connection-settings";
import { MODEL_CONNECTION_EVENT, MODEL_SETTINGS_GUARD_EVENT, modelRequest } from "./model-connection";

type CardsProps = { providers: ModelProviderList["providers"]; activeId: string | null; busy: boolean; onActivate: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onTest: (id: string) => void; onAdd: () => void };
export function ProviderCards({ providers, activeId, busy, onActivate, onEdit, onDelete, onTest, onAdd }: CardsProps) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {providers.map(({ id, configuration: config }) => <article key={id} aria-label={config.name} className={`flex min-w-0 flex-col rounded-xl border p-4 ${activeId === id ? "border-brand bg-brand-soft/30 ring-1 ring-brand" : "border-border"}`}>
      <div className="flex items-start gap-3"><span className="rounded-lg bg-brand-soft p-2 text-brand"><Server size={20} /></span><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{config.name}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{config.model}</p></div>{activeId === id && <span className="shrink-0 rounded-full bg-brand px-2 py-1 text-xs text-white">使用中</span>}</div>
      <p className="my-4 break-all text-xs text-muted-foreground">{config.baseUrl}</p>
      <div className="mt-auto flex flex-wrap gap-2"><Button size="sm" variant={activeId === id ? "outline" : "default"} disabled={busy || activeId === id} onClick={() => onActivate(id)}><Check size={14} />{activeId === id ? "当前服务" : "使用此服务"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onTest(id)}><PlugZap size={14} />测试</Button><Button size="icon" variant="ghost" aria-label={`编辑${config.name}`} disabled={busy} onClick={() => onEdit(id)}><Pencil size={15} /></Button><Button size="icon" variant="ghost" aria-label={`删除${config.name}`} disabled={busy} onClick={() => onDelete(id)}><Trash2 size={15} /></Button></div>
    </article>)}
    <button type="button" disabled={busy || providers.length >= 12} onClick={onAdd} className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-brand/40 text-sm text-brand hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><Plus size={25} />添加 API 服务商<span className="text-xs text-muted-foreground">{providers.length} / 12</span></button>
  </div>;
}

export function ConnectionSettings({ userId, onSaved, saveGuardRef }: { userId: string; onSaved?: (configuration: ModelConfiguration) => void; saveGuardRef?: RefObject<(() => boolean) | null> }) {
  const [list, setList] = useState<ModelProviderList | null>(null);
  const [editor, setEditor] = useState<{ id?: string; configuration: ModelConfiguration } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const guardRef = useRef<(() => boolean) | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void modelRequest("providers", undefined, controller.signal).then((value) => { setList(modelProviderListSchema.parse(value)); setFailure(""); }).catch((error: unknown) => { if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : "服务配置读取失败"); });
    return () => controller.abort();
  }, [userId, reload]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!saveGuardRef) return;
    const guard = () => !busy && (guardRef.current?.() ?? true);
    saveGuardRef.current = guard;
    return () => { if (saveGuardRef.current === guard) saveGuardRef.current = null; };
  }, [busy, saveGuardRef]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (requestRef.current || !(guardRef.current?.() ?? true)) event.preventDefault();
    };
    const intercept = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href], [role=tab]")) return;
      if (requestRef.current || !(guardRef.current?.() ?? true)) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", intercept, true);
    window.addEventListener(MODEL_SETTINGS_GUARD_EVENT, guard);
    return () => { document.removeEventListener("click", intercept, true); window.removeEventListener(MODEL_SETTINGS_GUARD_EVENT, guard); };
  }, []);
  async function operate(op: "activate" | "delete" | "test", id: string) {
    if (!list || requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller; setBusy(true); setFailure(""); setFeedback("");
    try {
      if (op === "test") {
        const result = z.object({ text: z.string(), latencyMs: z.number() }).parse(await modelRequest("test", { providerId: id }, controller.signal));
        setFeedback(`${list.providers.find((item) => item.id === id)?.configuration.name} · ${result.latencyMs} ms · ${result.text}`);
      } else {
        const value = await modelRequest("providers", { expectedRevision: list.revision, op, id }, controller.signal, "PATCH");
        setList(modelProviderListSchema.parse(value)); setDeleting(null); window.dispatchEvent(new Event(MODEL_CONNECTION_EVENT));
        setFeedback(op === "activate" ? "已切换当前服务，对话与规划将使用它" : "服务已删除；删除当前服务后需手动选择另一项");
      }
    } catch (error) { setFailure(controller.signal.aborted ? "已停止请求" : error instanceof Error ? error.message : "操作失败"); }
    finally { requestRef.current = null; setBusy(false); }
  }
  return <div className="space-y-5">
    <div><h3 className="font-semibold">API 服务商</h3><p className="mt-2 text-sm text-muted-foreground">保存多个服务，选中一个供所有对话和任务规划使用。保存配置后，请点击“使用此服务”。</p></div>
    <FormFeedback message={failure} /><FormFeedback message={feedback} tone="success" />
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !!editor} onClick={() => setReload((value) => value + 1)}><RefreshCw size={14} />刷新列表</Button>{busy && <Button size="sm" variant="outline" onClick={() => requestRef.current?.abort()}><Square size={14} />停止请求</Button>}{list && !list.activeId && <span className="self-center text-xs text-muted-foreground">尚未选择当前使用的服务</span>}</div>
    {!list ? <p role="status" className="text-sm text-muted-foreground">{failure ? "无法读取配置，请重试" : "读取服务配置…"}</p> : <ProviderCards providers={list.providers} activeId={list.activeId} busy={busy} onActivate={(id) => void operate("activate", id)} onEdit={(id) => { const provider = list.providers.find((item) => item.id === id); if (provider) setEditor({ id, configuration: provider.configuration }); }} onDelete={setDeleting} onTest={(id) => void operate("test", id)} onAdd={() => setEditor({ configuration: initialModelConfiguration })} />}
    <Dialog.Root open={!!editor} onOpenChange={(open) => { if (!open && (guardRef.current?.() ?? true)) setEditor(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" /><Dialog.Content className="dialog-surface fixed top-1/2 left-1/2 z-70 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7"><Dialog.Title className="pr-8 text-lg font-semibold">{editor?.id ? "编辑 API 服务商" : "添加 API 服务商"}</Dialog.Title><Dialog.Description className="my-3 text-xs text-muted-foreground">密钥仅用于服务端连接，不会回显已有密钥。保存不会切换当前服务。</Dialog.Description><Dialog.Close asChild><Button size="icon" variant="ghost" className="absolute top-3 right-3" aria-label="关闭服务配置"><X size={16} /></Button></Dialog.Close>{editor && list && <ConnectionForm configuration={editor.configuration} providerId={editor.id} knownIds={list.providers.map((item) => item.id)} revision={list.revision} onSaved={(configuration, next, savedId) => { setList(next); setEditor({ id: savedId, configuration }); onSaved?.(configuration); }} saveGuardRef={guardRef} />}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!deleting} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" /><Dialog.Content className="dialog-surface fixed top-1/2 left-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5"><Dialog.Title className="font-semibold">删除 API 服务商？</Dialog.Title><Dialog.Description className="my-4 text-sm text-muted-foreground">将删除此服务及其加密密钥。若正在使用此服务，将暂停模型调用，直到你手动选择另一项。</Dialog.Description><FormFeedback message={failure} /><div className="mt-4 flex gap-2"><Button disabled={busy} onClick={() => deleting && void operate("delete", deleting)}>确认删除</Button><Button disabled={busy} variant="outline" onClick={() => setDeleting(null)}>取消</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

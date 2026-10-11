"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Bookmark, Check, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { BoardFilters, GroupBy } from "./model";
import { savedTaskViewInputSchema, savedTaskViewListSchema, savedTaskViewSchema, savedTaskViewSummary, savedTaskViewUrl, type SavedTaskViewDTO, type SavedTaskViewInput, type SavedTaskViewLayout } from "./saved-views-client";

export type SavedTaskViewsProps = { projectId: string; layout: SavedTaskViewLayout; groupBy: GroupBy; filters: BoardFilters };
type Definition = Omit<SavedTaskViewInput, "name">;
type EditorMode = { kind: "create"; definition: Definition } | { kind: "rename"; view: SavedTaskViewDTO } | { kind: "update"; view: SavedTaskViewDTO; definition: Definition } | { kind: "delete"; view: SavedTaskViewDTO };

export function SavedTaskViews(props: SavedTaskViewsProps) {
  return <SavedTaskViewsDialog key={props.projectId} {...props} />;
}

function SavedTaskViewsDialog(props: SavedTaskViewsProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
    <Dialog.Trigger asChild><Button type="button" variant="outline" size="sm"><Bookmark aria-hidden="true" className="h-3.5 w-3.5" />我的视图</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
      <Dialog.Title className="pr-9 text-lg font-semibold">我的保存视图</Dialog.Title>
      <Dialog.Description className="mt-2 pr-6 text-sm leading-6 text-muted-foreground">保存已应用的筛选、布局和分组，之后直接打开。视图仅属于你，打开时仍需有项目访问权限。</Dialog.Description>
      <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3" disabled={pending} aria-label="关闭保存视图"><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close>
      <SavedTaskViewsEditor {...props} onPendingChange={setPending} onOpenView={() => setOpen(false)} />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function SavedTaskViewsEditor({ projectId, layout, groupBy, filters, onPendingChange, onOpenView }: SavedTaskViewsProps & { onPendingChange: (pending: boolean) => void; onOpenView: () => void }) {
  const [views, setViews] = useState<SavedTaskViewDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const fieldId = useId();
  const active = useRef(false);
  const fetching = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const feedback = useFeedback();
  const endpoint = `/api/v1/projects/${projectId}/task-views`;

  const load = useCallback(async (currentMode: EditorMode | null = null) => {
    if (!active.current || writing.current) return;
    fetching.current?.abort();
    const controller = new AbortController(); fetching.current = controller;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, "保存视图暂时无法读取，请重试"));
      const parsed = savedTaskViewListSchema.safeParse(body);
      if (!parsed.success || parsed.data.some((view) => view.projectId !== projectId)) throw new Error("保存视图内容无法读取，请重试");
      if (!active.current || controller.signal.aborted) return;
      const latest = parsed.data;
      setViews(latest); setLoaded(true); setConflict(false); setError(""); setSuccess(currentMode ? "已读取最新版本，保留了当前输入；请核对名称和筛选后再保存。" : "");
      if (currentMode && currentMode.kind !== "create") {
        const view = latest.find((item) => item.id === currentMode.view.id);
        if (!view) { setConflict(true); setSuccess(""); setError("该视图已被删除，当前输入仍保留。请先复制名称，再取消并保存为新视图。"); }
        else setMode({ ...currentMode, view });
      }
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "保存视图无法读取");
    } finally {
      if (active.current && fetching.current === controller && !controller.signal.aborted) { setLoading(false); fetching.current = null; }
    }
  }, [endpoint, projectId]);

  useEffect(() => {
    active.current = true;
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void load(); });
    return () => { mounted = false; active.current = false; fetching.current?.abort(); writing.current?.abort(); };
  }, [load]);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);

  function start(kind: "create" | "rename" | "update" | "delete", view?: SavedTaskViewDTO) {
    setError(""); setSuccess(""); setConflict(false);
    if (kind === "create" || kind === "update") {
      const parsed = savedTaskViewInputSchema.safeParse({ name: "当前视图", layout, groupBy, filters });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      const definition = { layout: parsed.data.layout, groupBy: parsed.data.groupBy, filters: parsed.data.filters };
      if (kind === "update" && view) { setMode({ kind, definition, view }); setName(view.name); }
      else { setMode({ kind: "create", definition }); setName(""); }
    } else if (view) { setMode({ kind, view }); setName(view.name); }
  }

  const save = async () => {
    if (!mode || writing.current || conflict || loading) return;
    const isDelete = mode.kind === "delete";
    const definition = mode.kind === "create" || mode.kind === "update" ? mode.definition : mode.view;
    const parsed = savedTaskViewInputSchema.safeParse({ name, layout: definition.layout, groupBy: definition.groupBy, filters: definition.filters });
    if (!isDelete && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    const controller = new AbortController(); writing.current = controller;
    fetching.current?.abort(); setPending(true); setError(""); setSuccess("");
    const isCreate = mode.kind === "create";
    try {
      const requestBody = isDelete ? { version: mode.view.version } : { ...parsed.data, ...(!isCreate && { version: mode.view.version }) };
      const response = await fetch(isCreate ? endpoint : `${endpoint}/${mode.view.id}`, { method: isDelete ? "DELETE" : isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(requestBody) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(responseError(body, "保存视图暂时无法更新，请重试")); }
      if (!active.current || controller.signal.aborted) return;
      let message: string;
      if (isDelete) {
        if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true) throw new Error("删除结果无法确认，请重新读取视图列表");
        setViews((items) => items.filter((item) => item.id !== mode.view.id)); message = "保存视图已删除，项目任务不受影响。";
      } else {
        const saved = savedTaskViewSchema.safeParse(body);
        if (!saved.success || saved.data.projectId !== projectId || (!isCreate && saved.data.id !== mode.view.id)) throw new Error("保存结果无法确认，请重新读取视图列表");
        setViews((items) => [saved.data, ...items.filter((item) => item.id !== saved.data.id)]);
        message = isCreate ? "当前筛选已保存为个人视图。" : mode.kind === "rename" ? "视图名称已更新，筛选保持原样。" : "该视图已更新为当前筛选。";
      }
      setMode(null); setName(""); setConflict(false); setSuccess(message); feedback(message);
    } catch (caught) {
      if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "保存视图更新失败");
    } finally { writing.current = null; if (active.current) setPending(false); }
  };

  const editingDefinition = mode && (mode.kind === "create" || mode.kind === "update" ? mode.definition : mode.view);
  return <div className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/15 bg-brand-soft/30 p-3">
      <div className="min-w-0"><p className="text-xs font-medium text-brand">当前已应用的视图</p><p className="mt-1 text-xs text-muted-foreground">{savedTaskViewSummary({ layout, groupBy, filters })}</p></div>
      <Button type="button" size="sm" disabled={loading || pending || Boolean(mode)} onClick={() => start("create")}><Plus aria-hidden="true" className="h-3.5 w-3.5" />保存当前</Button>
    </div>
    <FormFeedback message={error} /><FormFeedback message={success} tone="success" />
    {mode && editingDefinition && <form className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p className="text-sm font-medium">{mode.kind === "create" ? "保存新视图" : mode.kind === "rename" ? "重命名视图" : mode.kind === "update" ? "更新保存内容" : "删除保存视图"}</p>
      {mode.kind === "delete" ? <p className="break-words text-sm leading-6 text-muted-foreground">确认删除「{mode.view.name}」？之后可以重新保存当前筛选。</p> : <div className="space-y-2"><Label htmlFor={`${fieldId}-name`}>视图名称</Label><Input id={`${fieldId}-name`} autoFocus value={name} maxLength={80} disabled={loading || pending} onChange={(event) => { setName(event.target.value); setSuccess(""); }} placeholder="例如：我负责的阻塞任务" /><p className="text-xs text-muted-foreground">{savedTaskViewSummary(editingDefinition)}{mode.kind === "rename" ? "；只修改名称。" : "；未应用的筛选修改不会保存。"}</p></div>}
      {mode.kind === "update" && <p className="text-xs leading-5 text-muted-foreground">原视图：{savedTaskViewSummary(mode.view)}。确认后替换为上方当前视图。</p>}
      {mode.kind !== "create" && <p className="text-xs text-muted-foreground">正在处理：{mode.view.name} · 版本 {mode.view.version}{conflict ? "，请先读取最新版本并核对。" : ""}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { setMode(null); setName(""); setError(""); setConflict(false); }}>取消</Button><Button type="submit" size="sm" variant={mode.kind === "delete" ? "destructive" : "default"} disabled={loading || pending || conflict} loading={pending}>{mode.kind === "delete" ? <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Save aria-hidden="true" className="h-3.5 w-3.5" />}{mode.kind === "delete" ? "确认删除" : "保存"}</Button></div>
    </form>}
    {loading && <p role="status" className="text-sm text-muted-foreground">正在读取你的保存视图…</p>}
    {loaded && !views.length && !mode && <EmptyState icon={<Bookmark aria-hidden="true" className="h-5 w-5" />} title="还没有保存视图" description="先应用筛选，再将经常查看的任务范围保存到这里。" />}
    {views.length > 0 && <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="本项目的个人保存视图">{views.map((view) => {
      const current = savedTaskViewUrl(view) === savedTaskViewUrl({ projectId, layout, groupBy, filters });
      return <li key={view.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-brand/25">
        <div className="min-w-0 flex-1"><Button asChild variant="ghost" size="sm" disabled={pending || loading || Boolean(mode)} className="h-auto max-w-full justify-start px-0 py-1 text-left"><Link href={savedTaskViewUrl(view)} aria-label={`打开保存视图：${view.name}`} onClick={(event) => { if (pending || loading || mode) event.preventDefault(); else onOpenView(); }}><Bookmark aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand" /><span className="truncate">{view.name}</span>{current && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand" />}</Link></Button><p className="mt-1 text-[11px] text-muted-foreground">{savedTaskViewSummary(view)}{current ? " · 当前视图" : ""}</p></div>
        <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="sm" disabled={pending || loading || Boolean(mode)} onClick={() => start("rename", view)} title={`重命名视图：${view.name}`}><Pencil aria-hidden="true" className="h-3 w-3" />名称</Button><Button type="button" variant="ghost" size="sm" disabled={pending || loading || Boolean(mode)} onClick={() => start("update", view)} title={`将 ${view.name} 更新为当前筛选`}><Save aria-hidden="true" className="h-3 w-3" />更新</Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={pending || loading || Boolean(mode)} onClick={() => start("delete", view)} aria-label={`删除保存视图：${view.name}`}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></Button></div>
      </li>;
    })}</ul>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><p className="text-xs text-muted-foreground">标签被删除时保留原筛选，可返回页面调整。</p><Button type="button" variant="ghost" size="sm" disabled={loading || pending} onClick={() => { setSuccess(""); void load(mode); }}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{conflict || mode ? "读取最新版本" : "刷新列表"}</Button></div>
  </div>;
}

function responseError(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

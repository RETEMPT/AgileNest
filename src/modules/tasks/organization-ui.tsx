"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { ArrowDownLeft, ArrowUpRight, Check, CircleAlert, Link2, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/badge";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { DiscardChangesDialog } from "./form-guards";
import { TASK_LABEL_COLORS, TASK_LABEL_STYLES, taskLabelDTOSchema, taskOrganizationDTOSchema, type TaskDependencyDTO, type TaskLabelColor, type TaskLabelDTO, type TaskOrganizationDTO, type TaskOrganizationMutation } from "./organization-client";

async function responseData(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string().optional() }).safeParse(value);
    throw new Error(error.success ? error.data.error ?? "操作失败，请重试" : "操作失败，请重试");
  }
  return value;
}

export function TaskLabelPill({ label }: { label: Pick<TaskLabelDTO, "name" | "color"> }) {
  return <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TASK_LABEL_STYLES[label.color].className)}><Tag aria-hidden="true" className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{label.name}</span></span>;
}

export function TaskLabelFilter({ projectId, value, onChange, disabled }: { projectId: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const [labels, setLabels] = useState<TaskLabelDTO[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { const update = () => setRevision((current) => current + 1); window.addEventListener("agilenest:task-organization-changed", update); return () => window.removeEventListener("agilenest:task-organization-changed", update); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/v1/projects/${projectId}/task-labels`, { cache: "no-store", signal: controller.signal }).then(responseData).then((value) => {
      const result = z.object({ labels: z.array(taskLabelDTOSchema) }).parse(value);
      setLabels(result.labels); setError("");
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "标签加载失败"); });
    return () => controller.abort();
  }, [projectId, revision]);
  const scopedLabels = labels.filter((label) => label.projectId === projectId);
  return <div className="space-y-1"><label htmlFor={id} className="sr-only">项目标签筛选</label><select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">全部标签</option>{value && !scopedLabels.some((label) => label.id === value) && <option value={value}>所选标签已失效</option>}{scopedLabels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>{error && <button type="button" onClick={() => setRevision((current) => current + 1)} className="block text-xs text-destructive underline">{error} · 重试</button>}</div>;
}

type LabelDraft = { id: string | null; name: string; color: TaskLabelColor; version: number };
const blankLabel = (): LabelDraft => ({ id: null, name: "", color: "brand", version: 1 });

export function TaskOrganization(props: { taskId: string; projectId: string; onBusyChange?: (busy: boolean) => void }) {
  return <TaskOrganizationInner key={props.taskId} {...props} />;
}

function TaskOrganizationInner({ taskId, projectId, onBusyChange }: { taskId: string; projectId: string; onBusyChange?: (busy: boolean) => void }) {
  const id = useId();
  const router = useRouter();
  const notify = useFeedback();
  const [data, setData] = useState<TaskOrganizationDTO | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [otherTaskId, setOtherTaskId] = useState("");
  const [direction, setDirection] = useState<"blockedBy" | "blocking">("blockedBy");
  const [labelDialog, setLabelDialog] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionVersion, setSelectionVersion] = useState(1);
  const [labelDraft, setLabelDraft] = useState<LabelDraft>(blankLabel);
  const [labelError, setLabelError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [remove, setRemove] = useState<TaskDependencyDTO | null>(null);
  const [deleteLabel, setDeleteLabel] = useState<TaskLabelDTO | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const mutationBusy = useRef(false);
  const load = useCallback(async (search: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = taskOrganizationDTOSchema.parse(await responseData(await fetch(`/api/v1/tasks/${taskId}/organization?q=${encodeURIComponent(search)}`, { signal: controller.signal, cache: "no-store" })));
      if (result.projectId !== projectId) throw new Error("任务归属已变化，请从正确项目重新打开");
      if (!controller.signal.aborted && active.current) { setData(result); setError(""); return result; }
    } catch (cause) { if (!controller.signal.aborted && active.current) setError(cause instanceof Error ? cause.message : "任务组织信息加载失败"); }
    finally { if (!controller.signal.aborted && active.current) setLoading(false); }
  }, [taskId, projectId]);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(query); }, query ? 300 : 0); return () => window.clearTimeout(timer); }, [load, query]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const dirty = labelDraft.name.trim().length > 0 || Boolean(labelDraft.id) || [...selected].sort().join(",") !== [...(data?.labels.map((label) => label.id) ?? [])].sort().join(",");
  useEffect(() => {
    if (!busy && (!labelDialog || !dirty)) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, labelDialog, dirty]);
  function changed(message: string) { notify(message); router.refresh(); window.dispatchEvent(new Event("agilenest:task-organization-changed")); }
  async function mutate(change: TaskOrganizationMutation, message: string): Promise<boolean> {
    if (mutationBusy.current) return false;
    mutationBusy.current = true; request.current?.abort(); setBusy(true); setError("");
    try {
      const result = taskOrganizationDTOSchema.parse(await responseData(await fetch(`/api/v1/tasks/${taskId}/organization`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })));
      if (active.current) { setData(result); changed(message); }
      return true;
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "操作失败，原设置已保留"); return false; }
    finally { mutationBusy.current = false; if (active.current) { setBusy(false); setLoading(false); } }
  }
  async function saveLabel() {
    if (mutationBusy.current || !data) return;
    mutationBusy.current = true; setBusy(true); setLabelError("");
    try {
      const url = `/api/v1/projects/${projectId}/task-labels${labelDraft.id ? `/${labelDraft.id}` : ""}`;
      const value = await responseData(await fetch(url, { method: labelDraft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: labelDraft.name, color: labelDraft.color, ...(labelDraft.id ? { version: labelDraft.version } : {}) }) }));
      const { label } = z.object({ label: taskLabelDTOSchema }).parse(value);
      if (active.current) {
        setData((current) => current && ({ ...current, projectLabels: [...current.projectLabels.filter((item) => item.id !== label.id), label].sort((a, b) => a.name.localeCompare(b.name)), labels: current.labels.map((item) => item.id === label.id ? label : item) }));
        if (!labelDraft.id) setSelected((current) => current.length < 20 ? [...current, label.id] : current);
        setLabelDraft(blankLabel()); changed(labelDraft.id ? "标签已更新" : "项目标签已创建，请保存任务标签关联");
      }
    } catch (cause) { if (active.current) setLabelError(cause instanceof Error ? cause.message : "标签保存失败，输入已保留"); }
    finally { mutationBusy.current = false; if (active.current) setBusy(false); }
  }
  async function removeLabel(label: TaskLabelDTO) {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setBusy(true); setLabelError("");
    try {
      await responseData(await fetch(`/api/v1/projects/${projectId}/task-labels/${label.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: label.version }) }));
      if (active.current) { setDeleteLabel(null); setSelected((current) => current.filter((item) => item !== label.id)); if (labelDraft.id === label.id) setLabelDraft(blankLabel()); await load(query); changed("项目标签已删除，所有任务上的该标签已移除"); }
    } catch (cause) { if (active.current) setLabelError(cause instanceof Error ? cause.message : "标签删除失败"); }
    finally { mutationBusy.current = false; if (active.current) setBusy(false); }
  }
  function closeLabelDialog() { if (busy) return; if (dirty) setDiscardOpen(true); else setLabelDialog(false); }
  async function reloadLabelVersions() {
    const latest = await load(query);
    if (!latest) return;
    setSelectionVersion(latest.version);
    if (labelDraft.id) {
      const label = latest.projectLabels.find((item) => item.id === labelDraft.id);
      if (label) { setLabelDraft((current) => ({ ...current, version: label.version })); setLabelError(`已获取标签最新版本 v${label.version}，你的名称与颜色输入仍保留，请核对后再保存`); }
      else setLabelError("正在编辑的标签已被删除，请取消编辑或创建新标签");
    }
    notify("已获取最新任务版本，你的标签选择仍保留，请核对后保存");
  }
  function dependencies(title: string, items: TaskDependencyDTO[], incoming: boolean) {
    return <div className="min-w-0 rounded-xl border border-border bg-background/50 p-3"><h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">{incoming ? <ArrowDownLeft className="h-3.5 w-3.5 text-brand" /> : <ArrowUpRight className="h-3.5 w-3.5 text-accent-warm" />}{title}<span className="ml-auto font-normal text-muted-foreground">{items.length}</span></h3>{items.length ? <ul className="space-y-2">{items.map((item) => <li key={item.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-2.5"><div className="min-w-0 flex-1"><Link href={`/p/${projectId}/tasks/${item.task.id}`} className="block break-words text-xs font-medium hover:text-brand hover:underline">{item.task.title}</Link><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><StatusPill status={item.task.status} /><span className="text-[11px] text-muted-foreground">{item.task.assigneeName ?? "待认领"}</span></div>{incoming && item.task.status !== "accepted" && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">验收前会阻止本任务提交与通过</p>}</div>{item.canRemove && <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground" disabled={busy} aria-label={`解除与${item.task.title}的依赖`} onClick={() => setRemove(item)}><X className="h-3 w-3" /></Button>}</li>)}</ul> : <p className="py-3 text-center text-xs text-muted-foreground">{incoming ? "没有前置依赖，可独立推进" : "暂未关联后续任务"}</p>}</div>;
  }
  return <section aria-label="任务标签与依赖" className="rounded-xl border border-border bg-card p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-brand" />任务组织</h2><Button type="button" size="sm" variant="ghost" onClick={() => { void load(query); }} disabled={busy || loading} aria-label="重新加载标签与依赖"><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />刷新</Button></div>
    {!data && loading && <p role="status" className="py-4 text-sm text-muted-foreground">正在加载项目标签与任务关系…</p>}
    <FormFeedback message={error} className="mb-3 text-xs" />
    {data && <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">项目标签</span>{data.labels.map((label) => <TaskLabelPill key={label.id} label={label} />)}{!data.labels.length && <span className="text-xs text-muted-foreground">尚未设置</span>}{(data.canEdit || data.canManageLabels) && <Button type="button" size="sm" variant="ghost" disabled={busy} className="ml-auto h-7" onClick={() => { setSelected(data.labels.map((label) => label.id)); setSelectionVersion(data.version); setLabelDraft(blankLabel()); setLabelError(""); setLabelDialog(true); }}><Tag className="h-3 w-3" />{data.canEdit ? "调整标签" : "管理项目标签"}</Button>}</div>
      {data.blocked && <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />前置任务尚未验收。可以继续执行，本任务提交、重新提交和验收需等待前置任务全部通过。</div>}
      {data.reopenBlocked && <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">已有后续任务待验收或已完成。重新打开本任务前，需要先解除相应依赖，或处理后续任务的状态。</p>}
      <div className="grid gap-3 lg:grid-cols-2">{dependencies("依赖这些任务", data.blockedBy, true)}{dependencies("阻塞这些任务", data.blocking, false)}</div>
      {data.canEdit && <div className="space-y-2 rounded-lg border border-dashed border-border p-3"><label htmlFor={`${id}-query`} className="text-xs font-medium">关联当前项目任务</label><Input id={`${id}-query`} value={query} maxLength={100} disabled={busy} onChange={(event) => setQuery(event.target.value)} placeholder="输入任务名称搜索…" className="h-8 text-xs" /><div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]"><select value={direction} disabled={busy} aria-label="依赖方向" onChange={(event) => { setDirection(event.target.value as "blockedBy" | "blocking"); setOtherTaskId(""); }} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="blockedBy">本任务依赖</option><option value="blocking">本任务阻塞</option></select><select value={otherTaskId} disabled={busy || loading} aria-label="选择关联任务" onChange={(event) => setOtherTaskId(event.target.value)} className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"><option value="">{loading ? "搜索中…" : "选择任务名称"}</option>{otherTaskId && !data.candidates.some((item) => item.id === otherTaskId) && <option value={otherTaskId}>先前选中的任务</option>}{data.candidates.filter((item) => direction === "blockedBy" || item.canBlock).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.assigneeName ?? "待认领"}</option>)}</select><Button type="button" size="sm" disabled={busy || loading || !otherTaskId} onClick={async () => { if (await mutate({ op: "addDependency", version: data.version, otherTaskId, direction }, "任务依赖已关联")) setOtherTaskId(""); }}><Plus className="h-3 w-3" />关联</Button></div><p className="text-[11px] leading-5 text-muted-foreground">{data.candidatesTruncated ? "当前显示前 50 个匹配任务，请继续输入名称缩小范围。" : "只允许同项目且没有循环的关系。调整被阻塞任务需要指派权限或本人负责。"}</p></div>}
      {!data.canEdit && <p className="text-xs text-muted-foreground">项目成员可以查看；有指派权限的成员或当前负责人可以调整标签与依赖。</p>}
    </div>}
    <Dialog.Root open={labelDialog} onOpenChange={(open) => { if (!open) closeLabelDialog(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy || dirty) event.preventDefault(); }}><Dialog.Title className="text-base font-semibold">项目标签</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">统一项目分类名称；创建或修改标签后，保存本任务的选择。</Dialog.Description><Dialog.Close asChild><Button type="button" size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="关闭标签选择" disabled={busy}><X className="h-4 w-4" /></Button></Dialog.Close>
      <div className="mt-4 space-y-2">{data?.projectLabels.map((label) => <div key={label.id} className="flex items-center gap-2 rounded-lg border border-border p-2"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.includes(label.id)} disabled={busy || !data.canEdit} onChange={(event) => setSelected((current) => event.target.checked ? [...current, label.id] : current.filter((item) => item !== label.id))} className="h-4 w-4 accent-brand" /><TaskLabelPill label={label} /></label>{data.canManageLabels && <><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setLabelDraft({ id: label.id, name: label.name, color: label.color, version: label.version }); setLabelError(""); }}>编辑</Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`删除项目标签${label.name}`} disabled={busy} onClick={() => setDeleteLabel(label)}><Trash2 className="h-3 w-3" /></Button></>}</div>)}{!data?.projectLabels.length && <p className="rounded-lg border border-dashed border-border py-5 text-center text-sm text-muted-foreground">项目尚无标签</p>}{selected.filter((labelId) => !data?.projectLabels.some((label) => label.id === labelId)).map((labelId) => <button key={labelId} type="button" disabled={busy} onClick={() => setSelected((current) => current.filter((item) => item !== labelId))} className="text-xs text-destructive underline">移除已失效的选择</button>)}</div>
      {data?.canManageLabels && <form onSubmit={(event) => { event.preventDefault(); void saveLabel(); }} className="mt-4 space-y-2 rounded-xl border border-border bg-muted/25 p-3"><h3 className="text-xs font-semibold">{labelDraft.id ? "编辑项目标签" : "新建项目标签"}</h3><label htmlFor={`${id}-label-name`} className="sr-only">标签名称</label><Input id={`${id}-label-name`} value={labelDraft.name} maxLength={40} required disabled={busy} onChange={(event) => setLabelDraft({ ...labelDraft, name: event.target.value })} placeholder="如：前端、设计、待核对" /><div className="flex flex-wrap gap-2" aria-label="标签颜色">{TASK_LABEL_COLORS.map((color) => <button key={color} type="button" title={TASK_LABEL_STYLES[color].name} aria-label={TASK_LABEL_STYLES[color].name} aria-pressed={labelDraft.color === color} disabled={busy} onClick={() => setLabelDraft({ ...labelDraft, color })} className={cn("flex h-7 w-7 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", TASK_LABEL_STYLES[color].className, labelDraft.color === color && "ring-2 ring-ring ring-offset-1")}>{labelDraft.color === color && <Check className="h-3 w-3" />}</button>)}</div><FormFeedback message={labelError} className="text-xs" /><div className="flex justify-end gap-2">{labelDraft.id && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setLabelDraft(blankLabel())}>取消编辑</Button>}<Button type="submit" size="sm" disabled={busy || !labelDraft.name.trim()} loading={busy}>{labelDraft.id ? "保存标签" : "创建标签"}</Button></div></form>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" size="sm" disabled={busy || loading} onClick={() => { void reloadLabelVersions(); }}>加载最新版本，保留选择</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeLabelDialog}>取消</Button>{data?.canEdit && <Button type="button" size="sm" disabled={busy || selected.length > 20} loading={busy} onClick={async () => { if (await mutate({ op: "labels", version: selectionVersion, labelIds: selected }, "本任务标签已保存")) setLabelDialog(false); }}>保存选择</Button>}</div><FormFeedback message={error} className="mt-3 text-xs" />
      <DiscardChangesDialog open={discardOpen} onKeepEditing={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setLabelDialog(false); }} />
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={Boolean(remove || deleteLabel)} onOpenChange={(open) => { if (!open && !busy) { setRemove(null); setDeleteLabel(null); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" /><Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}><Dialog.Title className="text-base font-semibold">{deleteLabel ? "删除项目标签？" : "解除任务依赖？"}</Dialog.Title><Dialog.Description className="mt-2 break-words text-sm leading-6 text-muted-foreground">{deleteLabel ? `「${deleteLabel.name}」将从项目所有任务移除，任务和成果记录保留。` : `解除与「${remove?.task.title}」的依赖，两个任务的关联会一起移除。`}</Dialog.Description><FormFeedback message={deleteLabel ? labelError : error} className="mt-3 text-xs" /><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setRemove(null); setDeleteLabel(null); }}>取消</Button><Button type="button" variant={deleteLabel ? "destructive" : "default"} size="sm" disabled={busy} loading={busy} onClick={async () => { if (deleteLabel) await removeLabel(deleteLabel); else if (remove && data && await mutate({ op: "removeDependency", version: data.version, dependencyId: remove.id }, "任务依赖已解除")) setRemove(null); }}>确认{deleteLabel ? "删除" : "解除"}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

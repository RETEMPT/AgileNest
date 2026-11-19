"use client";

import { accountFetch } from "@/components/account-request";
import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { ArrowLeft, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RESOURCE_CATEGORIES, parseResourceQuery, selectResources, type ResourceDTO } from "@/modules/resources/client";
import { resourceDTOSchema } from "@/modules/resources/ui";
import { resourceCitation, resourceMetadataPatch, resourceTextPage, sharedResourceUrl } from "./shared-resources";

class ResourceRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function requestJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await accountFetch(url, { ...options, cache: "no-store", credentials: "same-origin" });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(data);
    throw new ResourceRequestError(parsed.success ? parsed.data.error : "资料操作失败，请重新加载后核对", response.status);
  }
  return data;
}

async function readResource(id: string, signal?: AbortSignal) {
  return z.object({ resource: resourceDTOSchema }).parse(await requestJson(`/api/v1/resources/${encodeURIComponent(id)}`, { signal })).resource;
}

export function SharedResourcesDialog({ projectId, onClose, onReturnFocus, onAttach, onBusyChange }: {
  projectId: string | null;
  onClose: () => void;
  onReturnFocus: () => void;
  onAttach: (text: string) => string | null;
  onBusyChange: (busy: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);
  function changeBusy(value: boolean) { busyLock.current = value; setBusy(value); onBusyChange(value); }
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busyLock.current) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-70 bg-black/35" />
      <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }} onEscapeKeyDown={(event) => { if (busyLock.current) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()} className="dialog-surface fixed top-1/2 left-1/2 z-70 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="text-lg font-semibold">共享资料库</Dialog.Title>
          <Button variant="ghost" size="icon" disabled={busy} aria-label="关闭共享资料库" onClick={onClose}><X size={18} /></Button>
        </div>
        <Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">查阅当前项目与所属团队的资料，引用到本地草稿，或预览后保存名称和标签。模型尚未接入。</Dialog.Description>
        <div className="mt-4 min-h-0 overflow-y-auto">
          {!projectId ? <p className="py-10 text-center text-sm text-muted-foreground">请先在 AI 工作区选择一个可访问的项目，再打开共享资料库。</p>
            : selectedId ? <SharedResourceDetail key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} onAttach={onAttach} onBusyChange={changeBusy} />
              : <SharedResourceList projectId={projectId} onSelect={setSelectedId} />}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function SharedResourceList({ projectId, onSelect }: { projectId: string; onSelect: (id: string) => void }) {
  const [state, setState] = useState<{ rows: ResourceDTO[]; error?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson(`/api/v1/resources?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal }).then((data) => {
      const parsed = z.object({ resources: z.array(resourceDTOSchema) }).parse(data);
      if (!controller.signal.aborted) setState({ rows: parsed.resources });
    }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ rows: [], error: error instanceof Error ? error.message : "资料加载失败" }); });
    return () => controller.abort();
  }, [projectId, attempt]);
  const rows = selectResources(state?.rows ?? [], parseResourceQuery(new URLSearchParams({ q: query, scope })));
  const pages = Math.max(1, Math.ceil(rows.length / 12));
  const current = Math.min(page, pages);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Input className="min-w-0 flex-1" aria-label="搜索共享资料" placeholder="搜索名称、标签或可读正文" maxLength={200} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      <select aria-label="资料范围" className="rounded-lg border border-border bg-card px-3 text-sm" value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); }}><option value="all">项目与团队</option><option value="project">当前项目</option><option value="team">团队共享</option></select>
    </div>
    {!state ? <p role="status" className="py-6 text-sm">正在读取共享资料…</p> : state.error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{state.error}</p><Button variant="outline" onClick={() => { setState(null); setAttempt((value) => value + 1); }}>重试读取</Button></div> : <>
      <p className="text-xs text-muted-foreground">共 {rows.length} 份 · 正文搜索仅覆盖已保存的文本，不解析 PDF、图片或外部链接。</p>
      <div className="space-y-2">{rows.slice((current - 1) * 12, current * 12).map((row) => <button type="button" key={row.id} onClick={() => onSelect(row.id)} className="w-full rounded-xl border border-border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="break-words text-sm font-medium">{row.title}</p><p className="mt-1 text-xs text-muted-foreground">{row.projectId ? "项目资料" : "团队共享"} · {RESOURCE_CATEGORIES[row.category]} · v{row.version} · {row.kind === "document" ? "文档" : row.kind === "file" ? "文件" : "链接"}</p>{row.tags.length > 0 && <p className="mt-2 break-words text-xs text-brand">{row.tags.join(" · ")}</p>}</button>)}</div>
      {!rows.length && <div className="space-y-2 py-6 text-center text-sm text-muted-foreground"><p>{state.rows.length ? "没有符合条件的资料" : "此项目及团队暂无共享资料"}</p>{(query || scope !== "all") && <Button variant="ghost" onClick={() => { setQuery(""); setScope("all"); setPage(1); }}>清除筛选</Button>}</div>}
      {pages > 1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</Button><span className="text-xs">{current} / {pages}</span><Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>下一页</Button></div>}
    </>}
  </div>;
}

function SharedResourceDetail({ id, onBack, onAttach, onBusyChange }: {
  id: string; onBack: () => void; onAttach: (text: string) => string | null; onBusyChange: (busy: boolean) => void;
}) {
  const formId = useId();
  const [resource, setResource] = useState<ResourceDTO | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<ReturnType<typeof resourceMetadataPatch> | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController(); controller.current = request;
    void readResource(id, request.signal).then((row) => { if (!request.signal.aborted) { setResource(row); setTitle(row.title); setTags(row.tags.join("，")); } }).catch((e: unknown) => { if (!request.signal.aborted) setError(e instanceof Error ? e.message : "读取失败，请返回列表重试"); });
    return () => request.abort();
  }, [id]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError(""); setFeedback("");
    try { await operation(); }
    catch (e) {
      if (controller.current?.signal.aborted) return;
      setError(e instanceof Error ? e.message : "操作失败，请重新加载后核对");
      if (e instanceof ResourceRequestError && [401, 403, 404].includes(e.status)) { setResource(null); setPreview(null); }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  function cite(withText: boolean) {
    void run(async () => {
      const latest = await readResource(id, controller.current?.signal);
      if (latest.version !== resource?.version) { setNeedsReload(true); setPreview(null); throw new Error("资料版本已变化，请载入最新版本后再引用"); }
      const message = onAttach(resourceCitation(latest, page, withText));
      if (message) throw new Error(message);
      setFeedback("已加入本地草稿，未发送给模型");
    });
  }
  function reload() {
    void run(async () => {
      const latest = await readResource(id, controller.current?.signal);
      setResource(latest); setNeedsReload(false); setPreview(null);
      setFeedback("已载入最新版本；名称和标签输入保留，请对照后重新预览");
    });
  }
  function save() {
    if (!resource || !preview || needsReload) return;
    void run(async () => {
      // An interrupted response may follow a committed write; require reconciliation before another attempt.
      setNeedsReload(true);
      const data = await requestJson(`/api/v1/resources/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preview), signal: controller.current?.signal });
      const next = z.object({ resource: resourceDTOSchema }).parse(data).resource;
      setResource(next); setTitle(next.title); setTags(next.tags.join("，")); setPreview(null); setNeedsReload(false);
      setFeedback(`已保存至共享资料库 v${next.version}`);
    });
  }
  const part = resource?.body ? resourceTextPage(resource.body, page) : null;
  return <div className="space-y-4">
    <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}><ArrowLeft size={15} />返回资料列表</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {feedback && <p role="status" className="text-sm text-brand">{feedback}</p>}
    {!resource && !error && <p role="status" className="text-sm">正在核对资料权限并读取…</p>}
    {resource && <>
      <h3 className="break-words font-semibold">{resource.title}</h3>
      <p className="text-xs text-muted-foreground">v{resource.version} · {resource.authorName ?? "原团队成员"} · {resource.projectId ? "项目资料" : "团队共享"}</p>
      <a href={sharedResourceUrl(resource)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-brand underline">打开原资料与目录管理<ExternalLink size={14} /></a>
      {part ? <div className="space-y-2"><p className="text-xs text-muted-foreground">原文 L{part.startLine}–L{part.endLine}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 p-3 text-xs leading-6 [overflow-wrap:anywhere]">{part.text}</pre>{part.pages > 1 && <div className="flex items-center justify-between"><Button size="sm" variant="outline" disabled={busy || part.page <= 1} onClick={() => setPage(part.page - 1)}>上一段</Button><span className="text-xs">{part.page} / {part.pages}</span><Button size="sm" variant="outline" disabled={busy || part.page >= part.pages} onClick={() => setPage(part.page + 1)}>下一段</Button></div>}</div> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">{resource.kind === "document" ? "这份文档暂无正文。" : "尚无可读取的文本。可打开原资料预览或下载；此处不解析 PDF、图片及外部网页。"}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || needsReload} onClick={() => cite(false)}>引用来源</Button>{part && <Button variant="outline" size="sm" disabled={busy || needsReload} onClick={() => cite(true)}>引用本段原文</Button>}</div>
      <p className="text-xs leading-5 text-muted-foreground">引用会复制来源信息及所选正文到当前浏览器草稿（原文最多 1800 字）。文档链接定位版本；文件和链接记录读取时版本，打开原资料仍需当前权限。</p>
      {needsReload && <div className="space-y-2 rounded-xl border border-border p-3"><p className="text-sm">请核对服务器最新内容后再操作。若上次保存响应中断，修改可能已经生效。</p><Button size="sm" variant="outline" disabled={busy} onClick={reload}>载入最新版本并重新核对</Button></div>}
      {(resource.canEdit ?? resource.canManage) && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); setError(""); try { setPreview(resourceMetadataPatch(resource, title, tags)); } catch (e) { setError(e instanceof Error ? e.message : "请检查输入"); } }}>
        <h4 className="text-sm font-medium">整理名称与标签</h4>
        <Label htmlFor={`${formId}-title`}>资料名称</Label><Input id={`${formId}-title`} maxLength={160} value={title} disabled={busy} onChange={(event) => { setTitle(event.target.value); setPreview(null); }} />
        <Label htmlFor={`${formId}-tags`}>标签（逗号分隔，最多 8 个）</Label><Input id={`${formId}-tags`} value={tags} disabled={busy} onChange={(event) => { setTags(event.target.value); setPreview(null); }} />
        <Button variant="outline" size="sm" type="submit" disabled={busy || needsReload}>预览修改</Button>
        {preview && <div className="space-y-3 rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">修改预览 · 基于 v{preview.version}</p><p className="break-words">名称：{resource.title} → {preview.title}</p><p className="break-words">标签：{resource.tags.join("、") || "无"} → {preview.tags.join("、") || "无"}</p><p className="text-xs text-muted-foreground">保存会更新共享资料，并沿用资料库已有的版本和通知规则。</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPreview(null)}>取消修改</Button><Button type="button" size="sm" disabled={busy || needsReload} loading={busy} onClick={save}>确认保存到资料库</Button></div></div>}
      </form>}
    </>}
  </div>;
}

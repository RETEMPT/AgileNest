"use client";

import { accountFetch } from "@/components/account-request";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { CheckCircle2, FileText, History, MessageSquare, Reply, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { ResourceMarkdown, ResourcePicker } from "@/modules/resources/ui";
import { FollowButton } from "@/modules/notify/ui";
import { MemberMentions, type MentionMember } from "@/components/collaboration/member-mentions";
import { discussionHistorySchema, discussionListSchema, discussionPostSchema, type DiscussionListDTO, type DiscussionPostDTO, type DiscussionRevisionDTO } from "./client";

type Props = { taskId: string; projectId: string; actorId: string; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void };
type Draft = { body: string; resourceIds: string[]; mentionedUserIds: string[]; parentId?: string };
const draftSchema = z.object({ body: z.string().max(10000), resourceIds: z.array(z.uuid()).max(10), parentId: z.uuid().optional(), mentionedUserIds: z.array(z.uuid()).max(20).default([]) });
const revisionNames = { create: "发布", edit: "编辑", withdraw: "撤回", resolve: "解决", reopen: "重新打开" };
const emptyDraft: Draft = { body: "", resourceIds: [], mentionedUserIds: [] };
function mentionIds(post: DiscussionPostDTO) { return post.mentions?.map((mention) => mention.userId) ?? []; }
function sameMentions(a: string[], b: string[]) { return a.length === b.length && a.every((id) => b.includes(id)); }
const textareaClass = "w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/30";
async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "操作失败，请重试");
  return data;
}
export function TaskDiscussions(props: Props) { return <DiscussionPanel key={`${props.actorId}:${props.taskId}`} {...props} />; }

function DiscussionPanel({ taskId, projectId, actorId, onBusyChange, onDirtyChange }: Props) {
  const [list, setList] = useState<DiscussionListDTO | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<{ post: DiscussionPostDTO; body: string; mentionedUserIds: string[]; latest?: DiscussionPostDTO } | null>(null);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [memberError, setMemberError] = useState("");
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [withdraw, setWithdraw] = useState<DiscussionPostDTO | null>(null);
  const [history, setHistory] = useState<{ post: DiscussionPostDTO; revisions?: DiscussionRevisionDTO[]; error?: string } | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const input = useRef<HTMLTextAreaElement>(null);
  const historyRequest = useRef(0);
  const feedback = useFeedback();
  const id = useId();
  const draftKey = `agilenest:discussion:${actorId}:${taskId}`;
  const busy = pending || uploading;
  const editDirty = !!editing && (editing.body !== editing.post.body || !sameMentions(editing.mentionedUserIds, mentionIds(editing.post)));
  const dirty = !!draft.body.trim() || draft.resourceIds.length > 0 || draft.mentionedUserIds.length > 0 || editDirty;
  const posts = list?.posts ?? [];
  const parent = posts.find((post) => post.id === draft.parentId);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const focus = /^#discussion-([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
        const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions${focus ? `?around=${focus}` : ""}`, { signal: controller.signal, cache: "no-store" })));
        if (!controller.signal.aborted) { setList(data); setLoadError(""); }
      } catch (cause) { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "讨论加载失败"); }
    }
    void load();
    return () => controller.abort();
  }, [taskId, reload]);
  useEffect(() => {
    const controller = new AbortController();
    void accountFetch(`/api/v1/tasks/${taskId}/discussions?members`, { signal: controller.signal, cache: "no-store" }).then(responseData).then((value) => {
      const data = z.object({ members: z.array(z.object({ userId: z.uuid(), name: z.string() })) }).parse(value);
      if (!controller.signal.aborted) { setMembers(data.members); setMemberError(""); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setMemberError(cause instanceof Error ? cause.message : "成员列表加载失败"); });
    return () => controller.abort();
  }, [taskId, reload]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try { const raw = localStorage.getItem(draftKey); if (raw) { const parsed = draftSchema.safeParse(JSON.parse(raw)); if (parsed.success) setDraft(parsed.data); } }
      catch { setStorageError("本机草稿保存不可用，请在关闭前发布或复制内容。"); }
      setDraftLoaded(true);
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try { if (draft.body || draft.resourceIds.length || draft.mentionedUserIds.length || draft.parentId) localStorage.setItem(draftKey, JSON.stringify(draft)); else localStorage.removeItem(draftKey); }
      catch { setStorageError("本机草稿保存不可用，请在关闭前发布或复制内容。"); }
    });
    return () => { active = false; };
  }, [draftKey, draftLoaded, draft]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    function followDiscussion() {
      if (!/^#discussion-[0-9a-f-]{36}$/i.test(location.hash)) return;
      setFilter("all"); setReload((value) => value + 1);
    }
    window.addEventListener("hashchange", followDiscussion);
    return () => window.removeEventListener("hashchange", followDiscussion);
  }, []);
  useEffect(() => {
    if (!/^#discussion-[0-9a-f-]{36}$/i.test(location.hash)) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [list, filter]);

  async function mutate(post: DiscussionPostDTO | null, body: object) {
    setPending(true); setError("");
    try {
      const data = z.object({ post: discussionPostSchema }).parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions${post ? `/${post.id}` : ""}`, { method: post ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })));
      setList((current) => current ? { ...current, posts: current.posts.some((row) => row.id === data.post.id) ? current.posts.map((row) => row.id === data.post.id ? data.post : row) : [...current.posts, data.post] } : { posts: [data.post], truncated: false, limit: 200 });
      setEditing(null); setWithdraw(null);
      if (!post) setDraft(emptyDraft);
      feedback(post ? "讨论已更新，历史记录保留" : "讨论与附件已发布");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "讨论保存失败，请重试"); return false; }
    finally { setPending(false); }
  }
  async function showHistory(post: DiscussionPostDTO) {
    const request = ++historyRequest.current;
    setHistory({ post }); setHistoryBusy(true);
    try {
      const data = discussionHistorySchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions/${post.id}?history`)));
      if (request === historyRequest.current) setHistory({ post, revisions: data.revisions });
    } catch (cause) { if (request === historyRequest.current) setHistory({ post, error: cause instanceof Error ? cause.message : "历史加载失败" }); }
    finally { if (request === historyRequest.current) setHistoryBusy(false); }
  }
  async function loadEarlier() {
    if (!list?.nextCursor || loadingEarlier) return;
    setLoadingEarlier(true); setLoadError("");
    try {
      const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions?before=${list.nextCursor}`, { cache: "no-store" })));
      setList((current) => current ? { ...data, posts: [...new Map([...data.posts, ...current.posts].map((post) => [post.id, post])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) } : data);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "较早讨论加载失败"); }
    finally { setLoadingEarlier(false); }
  }
  async function compareLatest() {
    if (!editing) return;
    setPending(true);
    try {
      const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions?around=${editing.post.id}`, { cache: "no-store" })));
      setList(data);
      const latest = data.posts.find((post) => post.id === editing.post.id);
      if (!latest) throw new Error("这条讨论不在最近列表中，请重新打开任务核对。");
      setEditing({ ...editing, latest }); setError("已显示最新正文；你的输入保留，请核对后采用最新版本再保存。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "最新版本加载失败"); }
    finally { setPending(false); }
  }
  function postCard(post: DiscussionPostDTO) {
    return <article key={post.id} id={`discussion-${post.id}`} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{post.authorName || "原成员"}<span className="ml-2 font-normal text-muted-foreground">{new Date(post.createdAt).toLocaleString("zh-CN")} · v{post.version}</span></span>{post.resolved && <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-brand"><CheckCircle2 className="h-3 w-3" />已解决</span>}</header>
      {post.withdrawn ? <p className="text-sm text-muted-foreground">此内容已撤回，历史与附件引用仍保留。</p> : <><ResourceMarkdown text={post.body} idPrefix={`discussion-${post.id}`} />{!!post.mentions?.length && <div className="flex flex-wrap gap-1" aria-label="本条提及">{post.mentions.map((mention) => <span key={mention.userId} className="rounded-full bg-brand-soft px-2 py-1 text-xs text-brand">@{mention.name}</span>)}</div>}{!!post.resources.length && <ul className="grid gap-2 sm:grid-cols-2">{post.resources.map((file) => <li key={file.id}><a href={`/api/v1/resources/${file.id}/file`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs text-brand hover:bg-brand-soft"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{file.title}<span className="block text-muted-foreground">{file.fileName} · 打开原文件</span></span></a></li>)}</ul>}</>}
      <footer className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
        {!post.parentId && !post.withdrawn && !post.resolved && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft((value) => ({ ...value, parentId: post.id })); setError(""); input.current?.focus(); }}><Reply className="h-3.5 w-3.5" />回复</Button>}
        {post.canEdit && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing({ post, body: post.body, mentionedUserIds: mentionIds(post) }); setError(""); }}>编辑</Button>}
        {post.canResolve && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void mutate(post, { op: "resolve", version: post.version, resolved: !post.resolved })}>{post.resolved ? "重新打开讨论" : "标为已解决"}</Button>}
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void showHistory(post)}><History className="h-3.5 w-3.5" />历史</Button>
        {post.canWithdraw && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setWithdraw(post); setError(""); }}>撤回</Button>}
      </footer>
    </article>;
  }
  const roots = posts.filter((post) => !post.parentId || !posts.some((row) => row.id === post.parentId));
  const visible = roots.filter((post) => filter === "all" || (filter === "resolved" ? post.resolved : !post.resolved));
  const files = [...new Map(posts.flatMap((post) => post.resources).map((file) => [file.id, file])).values()];
  return <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-brand" />讨论与任务附件{list && <span className="text-xs font-normal text-muted-foreground">{posts.length} 条</span>}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">交流问题、补充执行材料，再将正式成果文件选入提交版本。讨论不会改变任务状态。</p></div><div className="flex items-center gap-3"><FollowButton target={{ kind: "task", id: taskId }} /><Link href={`/p/${projectId}/resources`} className="text-xs text-brand hover:underline">项目资料库 →</Link></div></header>
    {!!files.length && <details className="rounded-xl border border-border bg-muted/20 p-3"><summary className="cursor-pointer text-xs font-medium">任务附件 · {files.length} 份</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{files.map((file) => <li key={file.id}><a href={`/api/v1/resources/${file.id}/file`} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">{file.fileName || file.title}</a></li>)}</ul><p className="mt-3 text-xs text-muted-foreground">此处为最近讨论引用的原文件；正式成果以提交与验收记录为准。</p></details>}
    <div className="flex flex-wrap items-center gap-1" aria-label="讨论筛选">{([["all", "全部"], ["open", "待解决"], ["resolved", "已解决"]] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setReload((value) => value + 1)}>刷新讨论</Button></div>
    {loadError && <div className="space-y-2"><FormFeedback message={loadError} /><Button type="button" variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>重新加载讨论</Button></div>}
    {!list && !loadError && <p role="status" className="text-xs text-muted-foreground">正在加载讨论…</p>}
    {list?.nextCursor && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-soft p-3 text-xs text-brand"><p>较早讨论和回复保留在历史中，可逐页查看。</p><Button type="button" size="sm" variant="outline" disabled={loadingEarlier || busy} onClick={() => void loadEarlier()}>{loadingEarlier ? "加载中…" : "加载较早讨论"}</Button></div>}
    {list && !visible.length && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{posts.length ? "此筛选下暂无讨论" : "还没有讨论。可先上传设计稿、说明或待确认的问题。"}</p>}
    <div className="space-y-4">{visible.map((root) => <div key={root.id} className="space-y-2">{postCard(root)}{posts.filter((post) => post.parentId === root.id).map((post) => <div key={post.id} className="ml-3 border-l-2 border-brand/15 pl-3 sm:ml-5">{postCard(post)}</div>)}</div>)}</div>
    <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); if (!busy) void mutate(null, draft); }}>
      {draft.parentId && <div className="flex items-start justify-between gap-3 rounded-lg bg-brand-soft p-3 text-xs text-brand"><span>回复 {parent?.authorName || "较早讨论"}{parent?.withdrawn || parent?.resolved ? " · 主题已撤回或解决，请改为新讨论" : ""}</span><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setDraft((value) => ({ ...value, parentId: undefined }))}>改为新讨论</Button></div>}
      <label className="block text-sm font-medium" htmlFor={`${id}-body`}>{draft.parentId ? "回复内容" : "发起讨论"}</label>
      <textarea ref={input} id={`${id}-body`} rows={3} maxLength={10000} disabled={busy || !draftLoaded} className={textareaClass} value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} placeholder="说明问题、进度或需要协作的内容，支持 Markdown。也可以仅发布附件。" />
      <ResourcePicker projectId={projectId} selectedIds={draft.resourceIds} label="任务附件" disabled={pending || !draftLoaded} onChange={(resourceIds) => setDraft((value) => ({ ...value, resourceIds }))} onUploadingChange={setUploading} />
      <MemberMentions members={members} value={draft.mentionedUserIds} disabled={busy || !draftLoaded || !!memberError} onChange={(mentionedUserIds) => setDraft((value) => ({ ...value, mentionedUserIds }))} />
      <FormFeedback message={memberError} />
      <p className="text-xs leading-5 text-muted-foreground">讨论附件与正式成果提交分别选择；上传的文件保存到项目资料库。正文草稿只保存在当前账号的本机浏览器。</p>
      <FormFeedback message={storageError} /><FormFeedback message={!editing && !withdraw ? error : undefined} />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{draft.body.length}/10000 字</span><Button type="submit" disabled={busy || !list || !draftLoaded || (!draft.body.trim() && !draft.resourceIds.length) || !!parent && (parent.withdrawn || parent.resolved)}><Send className="h-4 w-4" />{pending ? "发布中…" : uploading ? "附件上传中…" : draft.parentId ? "发布回复" : "发布讨论"}</Button></div>
    </form>
    <Dialog.Root open={!!editing || !!withdraw} onOpenChange={(open) => { if (!open && !pending) { setEditing(null); setWithdraw(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" /><Dialog.Content aria-describedby={`${id}-edit-description`} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending || editDirty) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-xl"><Dialog.Title className="text-lg font-semibold">{withdraw ? "撤回这条讨论？" : "编辑讨论"}</Dialog.Title><Dialog.Description id={`${id}-edit-description`} className="my-3 text-xs leading-5 text-muted-foreground">{withdraw ? "当前正文将隐藏，历史版本及附件引用保留；任务状态不会改变。" : "保存会产生新版本，原文与附件仍保留。取消会放弃本次编辑。"}</Dialog.Description>
      {editing && <div className="min-h-0 space-y-3 overflow-y-auto"><textarea aria-label="编辑讨论正文" className={textareaClass} rows={7} maxLength={10000} disabled={pending} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} /><MemberMentions members={members} value={editing.mentionedUserIds} disabled={pending || !!memberError} onChange={(mentionedUserIds) => setEditing({ ...editing, mentionedUserIds })} /><FormFeedback message={error} />{error && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void compareLatest()}>保留输入并核对最新版本</Button>}{editing.latest && <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-soft/20 p-3"><p className="text-xs font-medium">服务器版本 v{editing.latest.version}{editing.latest.withdrawn ? " · 已撤回" : ""}</p><ResourceMarkdown text={editing.latest.body} idPrefix="discussion-latest" /><Button type="button" variant="outline" size="sm" disabled={!editing.latest.canEdit || pending} onClick={() => { setEditing({ ...editing, post: editing.latest!, latest: undefined }); setError(""); }}>以此版本保存我的草稿</Button></div>}</div>}
      {withdraw && <FormFeedback message={error} />}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setWithdraw(null); setError(""); }}>取消</Button><Button type="button" variant={withdraw ? "destructive" : "default"} disabled={pending || !!editing && !editDirty} onClick={() => { if (withdraw) void mutate(withdraw, { op: "withdraw", version: withdraw.version }); else if (editing) void mutate(editing.post, { op: "edit", version: editing.post.version, body: editing.body, ...(sameMentions(editing.mentionedUserIds, mentionIds(editing.post)) ? {} : { mentionedUserIds: editing.mentionedUserIds }) }); }}>{pending ? "保存中…" : withdraw ? "确认撤回" : "保存新版本"}</Button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!history} onOpenChange={(open) => { if (!open) { historyRequest.current++; setHistory(null); setHistoryBusy(false); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" /><Dialog.Content aria-describedby={undefined} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-xl"><header className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-semibold">讨论历史</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭讨论历史"><X className="h-4 w-4" /></Button></Dialog.Close></header><div className="mt-4 min-h-0 space-y-3 overflow-y-auto">{historyBusy && <p role="status" className="text-xs text-muted-foreground">正在加载历史…</p>}{history?.error && <><FormFeedback message={history.error} /><Button variant="outline" size="sm" onClick={() => void showHistory(history.post)}>重新加载历史</Button></>}{history?.revisions?.map((revision) => <article key={revision.id} className="space-y-2 rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">v{revision.version} · {revisionNames[revision.kind]} · {revision.authorName || "原成员"} · {new Date(revision.createdAt).toLocaleString("zh-CN")}</p><ResourceMarkdown text={revision.body || "此版本无正文"} idPrefix={`revision-${revision.id}`} />{!!revision.mentions?.length && <p className="text-xs text-brand">{revision.mentions.map((mention) => `@${mention.name}`).join(" · ")}</p>}</article>)}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

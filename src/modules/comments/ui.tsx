"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, useState } from "react";
import { MessageSquare, Reply, Send } from "lucide-react";
import { z } from "zod";
import { accountFetch } from "@/components/account-request";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { projectCommentListSchema, projectCommentSchema, type ProjectCommentDTO, type ProjectCommentListDTO } from "./client";

type Props = { projectId: string; actorId: string; projectName: string };

async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "操作失败，请重试");
  return data;
}

const textareaClass = "w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/30";

export function ProjectComments(props: Props) {
  return <CommentsPanel key={`${props.actorId}:${props.projectId}`} {...props} />;
}

function CommentsPanel({ projectId, actorId, projectName }: Props) {
  const [list, setList] = useState<ProjectCommentListDTO | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [body, setBody] = useState("");
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<{ comment: ProjectCommentDTO; body: string } | null>(null);
  const [withdraw, setWithdraw] = useState<ProjectCommentDTO | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const feedback = useFeedback();
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    void accountFetch(`/api/v1/projects/${projectId}/comments`, { signal: controller.signal, cache: "no-store" })
      .then(responseData)
      .then((value) => { if (!controller.signal.aborted) setList(projectCommentListSchema.parse(value)); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "评论加载失败"); });
    return () => controller.abort();
  }, [projectId, reload]);

  const comments = list?.comments ?? [];
  const parent = comments.find((comment) => comment.id === parentId);
  const roots = comments.filter((comment) => !comment.parentId);

  async function mutate(comment: ProjectCommentDTO | null, patch: object) {
    setPending(true); setError("");
    try {
      const data = z.object({ comment: projectCommentSchema }).parse(await responseData(await accountFetch(`/api/v1/projects/${projectId}/comments${comment ? `/${comment.id}` : ""}`, {
        method: comment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })));
      setList((current) => {
        const rows = current ? current.comments : [];
        return { comments: rows.some((row) => row.id === data.comment.id) ? rows.map((row) => (row.id === data.comment.id ? data.comment : row)) : [...rows, data.comment] };
      });
      setEditing(null); setWithdraw(null);
      if (!comment) { setBody(""); setParentId(undefined); }
      feedback(comment ? "评论已更新" : "评论已发布");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "评论保存失败，请重试"); }
    finally { setPending(false); }
  }

  function commentCard(comment: ProjectCommentDTO) {
    return <article key={comment.id} id={`comment-${comment.id}`} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.authorName || "原成员"}</span>
        <span>{new Date(comment.createdAt).toLocaleString("zh-CN")} · v{comment.version}</span>
      </header>
      {comment.withdrawn ? <p className="text-sm text-muted-foreground">此内容已撤回。</p> : <p className="whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>}
      <footer className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
        {!comment.parentId && !comment.withdrawn && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setParentId(comment.id); setError(""); input.current?.focus(); }}><Reply className="h-3.5 w-3.5" />回复</Button>}
        {comment.canEdit && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing({ comment, body: comment.body }); setError(""); }}>编辑</Button>}
        {comment.canWithdraw && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setWithdraw(comment); setError(""); }}>撤回</Button>}
      </footer>
    </article>;
  }

  return <main className="space-y-6">
    <header>
      <Link href={`/p/${projectId}`} className="text-xs text-muted-foreground hover:text-brand">← 项目概览</Link>
      <h1 className="mt-3 text-3xl font-semibold">项目评论</h1>
      <p className="mt-2 text-sm text-muted-foreground">{projectName} · 教师和成员都可以在这里发表评论与回复。</p>
    </header>
    <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-brand" />评论{list && <span className="text-xs font-normal text-muted-foreground">{comments.length} 条</span>}</h2>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setReload((value) => value + 1)}>刷新评论</Button>
      </header>
      {loadError && <div className="space-y-2"><FormFeedback message={loadError} /><Button type="button" variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>重新加载</Button></div>}
      {!list && !loadError && <p role="status" className="text-xs text-muted-foreground">正在加载评论…</p>}
      {list && !comments.length && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">还没有评论，发表第一条评论吧。</p>}
      <div className="space-y-4">
        {roots.map((root) => <div key={root.id} className="space-y-2">
          {commentCard(root)}
          {comments.filter((comment) => comment.parentId === root.id).map((comment) => <div key={comment.id} className="ml-3 border-l-2 border-brand/15 pl-3 sm:ml-5">{commentCard(comment)}</div>)}
        </div>)}
      </div>
      <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); if (!pending && body.trim()) void mutate(null, { body, parentId }); }}>
        {parentId && <div className="flex items-start justify-between gap-3 rounded-lg bg-brand-soft p-3 text-xs text-brand"><span>回复 {parent?.authorName || "评论"}{parent?.withdrawn ? " · 已撤回，请改为新评论" : ""}</span><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setParentId(undefined)}>改为新评论</Button></div>}
        <label className="block text-sm font-medium" htmlFor={`${id}-body`}>{parentId ? "回复内容" : "发表评论"}</label>
        <textarea ref={input} id={`${id}-body`} rows={3} maxLength={10000} disabled={pending} className={textareaClass} value={body} onChange={(event) => setBody(event.target.value)} placeholder="写下对项目的评论，支持换行。" />
        <FormFeedback message={!editing && !withdraw ? error : undefined} />
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{body.length}/10000 字</span><Button type="submit" disabled={pending || !list || !body.trim()}>{pending ? "发布中…" : parentId ? "发布回复" : "发表评论"}<Send className="h-4 w-4" /></Button></div>
      </form>
      <Dialog.Root open={!!editing || !!withdraw} onOpenChange={(open) => { if (!open && !pending) { setEditing(null); setWithdraw(null); setError(""); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" />
          <Dialog.Content aria-describedby={`${id}-edit-desc`} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">{withdraw ? "撤回这条评论？" : "编辑评论"}</Dialog.Title>
            <Dialog.Description id={`${id}-edit-desc`} className="my-3 text-xs leading-5 text-muted-foreground">{withdraw ? "当前正文将隐藏，不能再回复。" : "保存会更新评论正文。"}</Dialog.Description>
            {editing && <textarea aria-label="编辑评论正文" className={textareaClass} rows={7} maxLength={10000} disabled={pending} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />}
            <FormFeedback message={withdraw ? error : undefined} />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setWithdraw(null); setError(""); }}>取消</Button>
              <Button type="button" variant={withdraw ? "destructive" : "default"} disabled={pending || (!!editing && !editing.body.trim())} onClick={() => { if (withdraw) void mutate(withdraw, { op: "withdraw", version: withdraw.version }); else if (editing) void mutate(editing.comment, { op: "edit", version: editing.comment.version, body: editing.body }); }}>{pending ? "保存中…" : withdraw ? "确认撤回" : "保存"}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  </main>;
}

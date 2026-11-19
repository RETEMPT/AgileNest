"use client";

import { accountFetch } from "@/components/account-request";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { z } from "zod";
import {
  CheckCircle2,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Reply,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { ResourceMarkdown, ResourcePicker } from "@/modules/resources/ui";
import { FollowButton } from "@/modules/notify/ui";
import { MemberMentions, type MentionMember } from "@/components/collaboration/member-mentions";
import type { TaskStatus } from "@/db/schema";
import {
  discussionHistorySchema,
  discussionListSchema,
  discussionPostSchema,
  type DiscussionListDTO,
  type DiscussionPostDTO,
  type DiscussionRevisionDTO,
} from "./client";

export type DiscussionTaskContext = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  assigneeName?: string | null;
  projectName?: string | null;
};

type Props = {
  taskId: string;
  projectId: string;
  actorId: string;
  task?: DiscussionTaskContext;
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type Draft = { body: string; resourceIds: string[]; mentionedUserIds: string[]; parentId?: string };
type DiscussionMember = MentionMember & { role?: "admin" | "teacher" | "student"; avatarUrl?: string | null };
type TimelineGroup = {
  key: string;
  authorId: string | null;
  authorName: string;
  day: string;
  posts: DiscussionPostDTO[];
};

const draftSchema = z.object({ body: z.string().max(10000), resourceIds: z.array(z.uuid()).max(10), parentId: z.uuid().optional(), mentionedUserIds: z.array(z.uuid()).max(20).default([]) });
const memberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  role: z.enum(["admin", "teacher", "student"]).optional(),
  avatarUrl: z.string().nullable().optional(),
});
const revisionNames = { create: "发布", edit: "编辑", withdraw: "撤回", resolve: "解决", reopen: "重新打开" };
const roleLabels: Record<string, string> = { admin: "管理员", teacher: "指导老师", student: "成员" };
const emptyDraft: Draft = { body: "", resourceIds: [], mentionedUserIds: [] };

function mentionIds(post: DiscussionPostDTO) {
  return post.mentions?.map((mention) => mention.userId) ?? [];
}

function sameMentions(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "讨论记录";
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  if (sameDay(date, today)) return "今天";
  if (sameDay(date, yesterday)) return "昨天";
  if (date.getFullYear() === today.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatDue(value?: string | null) {
  if (!value) return "未设置";
  const [, month, day] = value.slice(0, 10).split("-");
  return month && day ? `${Number(month)} 月 ${Number(day)} 日` : value;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function taskCode(taskId: string) {
  return `T-${taskId.slice(0, 8).toUpperCase()}`;
}

function buildTimeline(posts: DiscussionPostDTO[]): TimelineGroup[] {
  const roots = posts.filter((post) => !post.parentId || !posts.some((row) => row.id === post.parentId));
  const ordered = roots.flatMap((root) => [root, ...posts.filter((post) => post.parentId === root.id)]);
  const groups: TimelineGroup[] = [];
  for (const post of ordered) {
    const authorKey = post.createdById ?? `name:${post.authorName ?? "unknown"}`;
    const day = dayKey(post.createdAt);
    const authorName = post.authorName || "原成员";
    const last = groups.at(-1);
    if (!post.parentId && last && last.posts.every((row) => !row.parentId) && last.authorId === post.createdById && last.authorName === authorName && last.day === day) {
      last.posts.push(post);
    } else {
      groups.push({ key: `${authorKey}:${day}:${post.id}`, authorId: post.createdById, authorName, day, posts: [post] });
    }
  }
  return groups;
}

async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "操作失败，请重试");
  return data;
}

export function TaskDiscussions(props: Props) {
  return <DiscussionPanel key={`${props.actorId}:${props.taskId}`} {...props} />;
}

function DiscussionPanel({ taskId, projectId, actorId, task, compact = false, onBusyChange, onDirtyChange }: Props) {
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
  const [members, setMembers] = useState<DiscussionMember[]>([]);
  const [memberError, setMemberError] = useState("");
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [withdraw, setWithdraw] = useState<DiscussionPostDTO | null>(null);
  const [history, setHistory] = useState<{ post: DiscussionPostDTO; revisions?: DiscussionRevisionDTO[]; error?: string } | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const didInitialScroll = useRef(false);
  const historyRequest = useRef(0);
  const feedback = useFeedback();
  const id = useId();
  const draftKey = `agilenest:discussion:${actorId}:${taskId}`;
  const busy = pending || uploading;
  const editDirty = !!editing && (editing.body !== editing.post.body || !sameMentions(editing.mentionedUserIds, mentionIds(editing.post)));
  const dirty = !!draft.body.trim() || draft.resourceIds.length > 0 || draft.mentionedUserIds.length > 0 || editDirty;
  const posts = list?.posts ?? [];
  const parent = posts.find((post) => post.id === draft.parentId);
  const parentBlocked = !!draft.parentId && (!parent || parent.withdrawn || parent.resolved);
  const canSend = !!list && draftLoaded && !busy && !parentBlocked && (!!draft.body.trim() || draft.resourceIds.length > 0);
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const postById = new Map(posts.map((post) => [post.id, post]));

  const roots = posts.filter((post) => !post.parentId || !posts.some((row) => row.id === post.parentId));
  const visibleRoots = roots.filter((post) => filter === "all" || (filter === "resolved" ? post.resolved : !post.resolved));
  const visiblePosts = visibleRoots.flatMap((root) => [root, ...posts.filter((post) => post.parentId === root.id)]);
  const groups = buildTimeline(visiblePosts);
  const files = [...new Map(posts.flatMap((post) => post.resources).map((file) => [file.id, file])).values()];

  function scrollToBottom(smooth = false) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const node = thread.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }));
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const focus = /^#discussion-([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
        const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions${focus ? `?around=${focus}` : ""}`, { signal: controller.signal, cache: "no-store" })));
        if (!controller.signal.aborted) {
          setList(data);
          setLoadError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "讨论加载失败");
      }
    }
    void load();
    return () => controller.abort();
  }, [taskId, reload]);

  useEffect(() => {
    const controller = new AbortController();
    void accountFetch(`/api/v1/tasks/${taskId}/discussions?members`, { signal: controller.signal, cache: "no-store" }).then(responseData).then((value) => {
      const data = z.object({ members: z.array(memberSchema) }).parse(value);
      if (!controller.signal.aborted) {
        setMembers(data.members);
        setMemberError("");
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setMemberError(cause instanceof Error ? cause.message : "成员列表加载失败");
    });
    return () => controller.abort();
  }, [taskId, reload]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = draftSchema.safeParse(JSON.parse(raw));
          if (parsed.success) setDraft(parsed.data);
        }
      } catch {
        setStorageError("本机草稿保存不可用，请在关闭前发布或复制内容。");
      }
      setDraftLoaded(true);
    });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        if (draft.body || draft.resourceIds.length || draft.mentionedUserIds.length || draft.parentId) localStorage.setItem(draftKey, JSON.stringify(draft));
        else localStorage.removeItem(draftKey);
      } catch {
        setStorageError("本机草稿保存不可用，请在关闭前发布或复制内容。");
      }
    });
    return () => { active = false; };
  }, [draftKey, draftLoaded, draft]);

  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [draft.body]);

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
      setFilter("all");
      setReload((value) => value + 1);
    }
    window.addEventListener("hashchange", followDiscussion);
    return () => window.removeEventListener("hashchange", followDiscussion);
  }, []);

  useEffect(() => {
    if (!/^#discussion-[0-9a-f-]{36}$/i.test(location.hash)) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [list, filter]);

  useEffect(() => {
    if (!list || didInitialScroll.current) return;
    didInitialScroll.current = true;
    if (!/^#discussion-[0-9a-f-]{36}$/i.test(location.hash)) scrollToBottom();
  }, [list]);

  async function mutate(post: DiscussionPostDTO | null, body: object) {
    setPending(true);
    setError("");
    try {
      const data = z.object({ post: discussionPostSchema }).parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions${post ? `/${post.id}` : ""}`, {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })));
      setList((current) => current ? {
        ...current,
        posts: current.posts.some((row) => row.id === data.post.id) ? current.posts.map((row) => row.id === data.post.id ? data.post : row) : [...current.posts, data.post],
      } : { posts: [data.post], truncated: false, limit: 200 });
      setEditing(null);
      setWithdraw(null);
      if (!post) {
        setFilter("all");
        setDraft(emptyDraft);
        scrollToBottom(true);
      }
      feedback(post ? "讨论已更新，历史记录保留" : "讨论与附件已发布");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "讨论保存失败，请重试");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function showHistory(post: DiscussionPostDTO) {
    const request = ++historyRequest.current;
    setHistory({ post });
    setHistoryBusy(true);
    try {
      const data = discussionHistorySchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions/${post.id}?history`)));
      if (request === historyRequest.current) setHistory({ post, revisions: data.revisions });
    } catch (cause) {
      if (request === historyRequest.current) setHistory({ post, error: cause instanceof Error ? cause.message : "历史加载失败" });
    } finally {
      if (request === historyRequest.current) setHistoryBusy(false);
    }
  }

  async function loadEarlier() {
    if (!list?.nextCursor || loadingEarlier) return;
    setLoadingEarlier(true);
    setLoadError("");
    try {
      const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions?before=${list.nextCursor}`, { cache: "no-store" })));
      setList((current) => current ? {
        ...data,
        posts: [...new Map([...data.posts, ...current.posts].map((post) => [post.id, post])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      } : data);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "较早讨论加载失败");
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function compareLatest() {
    if (!editing) return;
    setPending(true);
    try {
      const data = discussionListSchema.parse(await responseData(await accountFetch(`/api/v1/tasks/${taskId}/discussions?around=${editing.post.id}`, { cache: "no-store" })));
      setList(data);
      const latest = data.posts.find((post) => post.id === editing.post.id);
      if (!latest) throw new Error("这条讨论不在最近列表中，请重新打开任务核对。");
      setEditing({ ...editing, latest });
      setError("已显示最新正文；你的输入保留，请核对后采用最新版本再保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "最新版本加载失败");
    } finally {
      setPending(false);
    }
  }

  function startReply(post: DiscussionPostDTO) {
    setDraft((value) => ({ ...value, parentId: post.id }));
    setError("");
    input.current?.focus();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) form.current?.requestSubmit();
  }

  function messageActions(post: DiscussionPostDTO) {
    return <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label="更多消息操作" disabled={busy}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={8} className="z-[60] min-w-36 rounded-lg border border-border bg-card p-1 shadow-sm">
          {!post.parentId && !post.withdrawn && !post.resolved && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted" onSelect={() => startReply(post)}><Reply className="h-3.5 w-3.5" />回复</DropdownMenu.Item>}
          {post.canEdit && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted" onSelect={() => { setEditing({ post, body: post.body, mentionedUserIds: mentionIds(post) }); setError(""); }}>编辑</DropdownMenu.Item>}
          {post.canResolve && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted" onSelect={() => void mutate(post, { op: "resolve", version: post.version, resolved: !post.resolved })}>{post.resolved ? "重新打开" : "标为已解决"}</DropdownMenu.Item>}
          <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted" onSelect={() => void showHistory(post)}><History className="h-3.5 w-3.5" />历史</DropdownMenu.Item>
          {post.canWithdraw && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive outline-none data-[highlighted]:bg-destructive/10" onSelect={() => { setWithdraw(post); setError(""); }}>撤回</DropdownMenu.Item>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>;
  }

  function messageFooter(post: DiscussionPostDTO) {
    return <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
      <div>
        {!post.parentId && !post.withdrawn && !post.resolved && <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground" disabled={busy} onClick={() => startReply(post)}><Reply className="h-3.5 w-3.5" />回复</Button>}
      </div>
      {messageActions(post)}
    </div>;
  }

  function messageBody(post: DiscussionPostDTO, separated: boolean) {
    const parentPost = post.parentId ? postById.get(post.parentId) : undefined;
    const author = post.createdById ? memberById.get(post.createdById) : undefined;
    return <div id={`discussion-${post.id}`} className={`scroll-mt-4 px-3 pb-3 pl-10 ${separated ? "border-t border-border/60 pt-2.5" : ""}`}>
      <div className="max-w-[46rem]">
        {parentPost && <div className="mb-2 rounded-md border-l-2 border-border bg-muted/40 px-2.5 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">{parentPost.authorName || "原成员"}</p>
          <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{parentPost.body || "（附件内容）"}</p>
        </div>}
        {post.withdrawn ? <p className="text-sm leading-6 text-muted-foreground">此内容已撤回，历史与附件引用仍保留。</p> : <>
          <ResourceMarkdown compact text={post.body} mentions={post.mentions?.map((mention) => mention.name)} idPrefix={`discussion-${post.id}`} />
          {!!post.resources.length && <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {post.resources.map((file) => <li key={file.id}>
              <a href={`/api/v1/resources/${file.id}/file`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-2 text-xs transition-colors hover:bg-muted/30">
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{file.title}</span>
                  <span className="block truncate text-muted-foreground">{file.fileName || "原文件"} · {formatBytes(file.size)}</span>
                </span>
              </a>
            </li>)}
          </ul>}
        </>}
      </div>
      {messageFooter(post)}
      {author && <span className="sr-only">{author.name}</span>}
    </div>;
  }

  function renderGroup(group: TimelineGroup, index: number) {
    const first = group.posts[0];
    const author = group.authorId ? memberById.get(group.authorId) : undefined;
    const previousDay = index > 0 ? groups[index - 1].day : null;
    return <div key={group.key}>
      {previousDay !== group.day && <div className="py-4 text-center text-xs text-muted-foreground"><span aria-hidden="true">—— </span>{formatDay(first.createdAt)}<span aria-hidden="true"> ——</span></div>}
      <article className="rounded-[10px] border border-border bg-card">
        <header className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
          <UserAvatar name={group.authorName} src={author?.avatarUrl} className="h-5 w-5 text-[10px]" />
          <span className="text-xs font-medium text-foreground">{group.authorName}</span>
          <time className="text-xs text-muted-foreground" dateTime={first.createdAt}>{formatTime(first.createdAt)}</time>
          {first.resolved && <span className="ml-auto inline-flex items-center gap-1 text-xs text-brand"><CheckCircle2 className="h-3.5 w-3.5" />已解决</span>}
        </header>
        {group.posts.map((post, postIndex) => <div key={post.id}>{messageBody(post, postIndex > 0)}</div>)}
      </article>
    </div>;
  }

  return <>
    <section aria-labelledby={`${id}-title`} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={compact ? "flex h-[560px]" : "flex h-[600px] sm:h-[680px]"}>
        {task && !compact && <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border bg-muted/20 lg:flex">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">{taskCode(task.id)}</span>
              <StatusPill status={task.status} />
            </div>
            <p className="mt-2 text-sm font-medium leading-6 text-foreground">{task.title}</p>
            {task.projectName && <p className="mt-1 truncate text-xs text-muted-foreground">{task.projectName}</p>}
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">截止</dt><dd className="text-right text-foreground">{formatDue(task.dueDate)}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">负责人</dt><dd className="truncate text-right text-foreground">{task.assigneeName || "待认领"}</dd></div>
            </dl>
            <Link href={`/p/${projectId}/resources`} className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline">项目资料库 →</Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium text-foreground">团队成员</h3><span className="text-xs text-muted-foreground">{members.length}</span></div>
            <ul className="mt-3 space-y-2">
              {members.map((member) => <li key={member.userId} className="flex min-w-0 items-center gap-2">
                <UserAvatar name={member.name} src={member.avatarUrl} className="h-5 w-5 text-[10px]" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{member.name}{member.userId === actorId ? "（我）" : ""}</span>
                {member.role && <span className="shrink-0 text-xs text-muted-foreground">{roleLabels[member.role]}</span>}
              </li>)}
            </ul>
            {!members.length && !memberError && <p role="status" className="mt-2 text-xs text-muted-foreground">正在加载成员…</p>}
            <FormFeedback message={memberError} />
          </div>
          <p className="border-t border-border p-4 text-xs leading-5 text-muted-foreground">讨论在任务内异步保留；有结论时由负责人更新任务状态。</p>
        </aside>}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 shrink-0 text-brand" /><h2 id={`${id}-title`} className="truncate text-sm font-semibold text-foreground">任务讨论</h2>{list && <span className="shrink-0 text-xs text-muted-foreground">{posts.length} 条</span>}</div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{task ? `${taskCode(task.id)} · ${task.title}` : "异步讨论、提及与资料引用"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <FollowButton target={{ kind: "task", id: taskId }} />
              <Button type="button" variant="ghost" size="icon" aria-label="刷新讨论" disabled={busy || !list} onClick={() => setReload((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${!list ? "animate-spin" : ""}`} /></Button>
            </div>
          </header>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <div className="flex items-center gap-0.5" role="group" aria-label="讨论筛选">
              {([["all", "全部"], ["open", "待解决"], ["resolved", "已解决"]] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} className="h-7 px-2 text-xs" onClick={() => setFilter(value)}>{label}</Button>)}
            </div>
            <span className="truncate text-xs text-muted-foreground">{files.length ? `${files.length} 份资料` : "讨论不改变任务状态"}</span>
          </div>
          <div ref={thread} aria-label="讨论消息" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
            {loadError && <div className="mb-3 space-y-2"><FormFeedback message={loadError} /><Button type="button" variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>重新加载讨论</Button></div>}
            {!list && !loadError && <div className="space-y-3 py-2" role="status"><p className="text-xs text-muted-foreground">正在加载讨论…</p><div className="h-16 rounded-lg bg-muted/40" /><div className="h-12 w-3/4 rounded-lg bg-muted/30" /></div>}
            {list?.nextCursor && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"><p className="text-muted-foreground">较早讨论保留在历史中。</p><Button type="button" size="sm" variant="outline" disabled={loadingEarlier || busy} onClick={() => void loadEarlier()}>{loadingEarlier ? "加载中…" : "加载较早讨论"}</Button></div>}
            {!!files.length && <details className="mb-4 rounded-lg border border-border bg-muted/15 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground">讨论资料 · {files.length} 份</summary>
              <ul className="mt-2 space-y-1">{files.map((file) => <li key={file.id}><a href={`/api/v1/resources/${file.id}/file`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs text-brand hover:underline"><span className="truncate">{file.fileName || file.title}</span><span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span></a></li>)}</ul>
            </details>}
            {list && !visibleRoots.length && <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">{posts.length ? "此筛选下暂无讨论" : "还没有讨论"}</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{posts.length ? "切换到全部，或发起新的讨论。" : "围绕这条任务异步留言，补充设计稿、问题或待确认事项。"}</p>
            </div>}
            <div className="space-y-4">{groups.map(renderGroup)}</div>
          </div>
          <form ref={form} className="max-h-[55%] shrink-0 overflow-y-auto border-t border-border p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); if (canSend) void mutate(null, draft); }}>
            {draft.parentId && <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-brand/20 bg-brand-soft/50 px-2.5 py-2 text-xs text-brand">
              <span className="min-w-0">回复 {parent?.authorName || "较早讨论"}{parentBlocked ? " · 主题已撤回或解决，请改为新讨论" : ""}</span>
              <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-1.5 text-xs" disabled={busy} onClick={() => setDraft((value) => ({ ...value, parentId: undefined }))}>取消回复</Button>
            </div>}
            <label htmlFor={`${id}-body`} className="sr-only">{draft.parentId ? "回复内容" : "讨论内容"}</label>
            <div className="flex items-end gap-2">
              <textarea ref={input} id={`${id}-body`} rows={1} maxLength={10000} disabled={busy || !draftLoaded} value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} onKeyDown={handleComposerKeyDown} placeholder="输入消息，Enter 发送，Shift + Enter 换行" className="min-h-10 w-full resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] duration-150 [scrollbar-width:none] focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60 [&::-webkit-scrollbar]:hidden" />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!canSend} aria-label={draft.parentId ? "发布回复" : "发送讨论"}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <details className="rounded-lg border border-border bg-background">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"><Paperclip className="h-3.5 w-3.5" />附件{draft.resourceIds.length > 0 && <span className="rounded bg-brand-soft px-1.5 text-brand">{draft.resourceIds.length}</span>}</summary>
                <div className="w-[min(34rem,calc(100vw-4rem))] max-w-full border-t border-border p-2"><ResourcePicker projectId={projectId} selectedIds={draft.resourceIds} label="任务附件" disabled={pending || !draftLoaded} onChange={(resourceIds) => setDraft((value) => ({ ...value, resourceIds }))} onUploadingChange={setUploading} /></div>
              </details>
              <div className="min-w-[12rem] flex-1"><MemberMentions members={members} value={draft.mentionedUserIds} disabled={busy || !draftLoaded || !!memberError} onChange={(mentionedUserIds) => setDraft((value) => ({ ...value, mentionedUserIds }))} /></div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{draft.body.length}/10000</span>
              <span className="truncate">支持 Markdown、@ 提及与附件引用</span>
            </div>
            <FormFeedback message={memberError} />
            <FormFeedback message={storageError} />
            <FormFeedback message={!editing && !withdraw ? error : undefined} />
          </form>
        </div>
      </div>
    </section>
    <Dialog.Root open={!!editing || !!withdraw} onOpenChange={(open) => { if (!open && !pending) { setEditing(null); setWithdraw(null); setError(""); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content aria-describedby={`${id}-edit-description`} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending || editDirty) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <Dialog.Title className="text-lg font-semibold">{withdraw ? "撤回这条讨论？" : "编辑讨论"}</Dialog.Title>
          <Dialog.Description id={`${id}-edit-description`} className="my-3 text-xs leading-5 text-muted-foreground">{withdraw ? "当前正文将隐藏，历史版本及附件引用保留；任务状态不会改变。" : "保存会产生新版本，原文与附件仍保留。取消会放弃本次编辑。"}</Dialog.Description>
          {editing && <div className="min-h-0 space-y-3 overflow-y-auto">
            <textarea aria-label="编辑讨论正文" className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/30" rows={7} maxLength={10000} disabled={pending} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />
            <MemberMentions members={members} value={editing.mentionedUserIds} disabled={pending || !!memberError} onChange={(mentionedUserIds) => setEditing({ ...editing, mentionedUserIds })} />
            <FormFeedback message={error} />
            {error && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void compareLatest()}>保留输入并核对最新版本</Button>}
            {editing.latest && <div className="space-y-3 rounded-lg border border-brand/20 bg-brand-soft/20 p-3"><p className="text-xs font-medium">服务器版本 v{editing.latest.version}{editing.latest.withdrawn ? " · 已撤回" : ""}</p><ResourceMarkdown text={editing.latest.body} idPrefix="discussion-latest" /><Button type="button" variant="outline" size="sm" disabled={!editing.latest.canEdit || pending} onClick={() => { setEditing({ ...editing, post: editing.latest!, latest: undefined }); setError(""); }}>以此版本保存我的草稿</Button></div>}
          </div>}
          {withdraw && <FormFeedback message={error} />}
          <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setWithdraw(null); setError(""); }}>取消</Button><Button type="button" variant={withdraw ? "destructive" : "default"} disabled={pending || !!editing && !editDirty} onClick={() => { if (withdraw) void mutate(withdraw, { op: "withdraw", version: withdraw.version }); else if (editing) void mutate(editing.post, { op: "edit", version: editing.post.version, body: editing.body, ...(sameMentions(editing.mentionedUserIds, mentionIds(editing.post)) ? {} : { mentionedUserIds: editing.mentionedUserIds }) }); }}>{pending ? "保存中…" : withdraw ? "确认撤回" : "保存新版本"}</Button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={!!history} onOpenChange={(open) => { if (!open) { historyRequest.current++; setHistory(null); setHistoryBusy(false); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content aria-describedby={undefined} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <header className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-semibold">讨论历史</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭讨论历史"><X className="h-4 w-4" /></Button></Dialog.Close></header>
          <div className="mt-4 min-h-0 space-y-3 overflow-y-auto">
            {historyBusy && <p role="status" className="text-xs text-muted-foreground">正在加载历史…</p>}
            {history?.error && <><FormFeedback message={history.error} /><Button variant="outline" size="sm" onClick={() => void showHistory(history.post)}>重新加载历史</Button></>}
            {history?.revisions?.map((revision) => <article key={revision.id} className="space-y-2 rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">v{revision.version} · {revisionNames[revision.kind]} · {revision.authorName || "原成员"} · {new Date(revision.createdAt).toLocaleString("zh-CN")}</p><ResourceMarkdown text={revision.body || "此版本无正文"} idPrefix={`revision-${revision.id}`} />{!!revision.mentions?.length && <p className="text-xs text-brand">{revision.mentions.map((mention) => `@${mention.name}`).join(" · ")}</p>}</article>)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

"use client";

import { useActionState, useId, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { FileText, LogOut, Pin, Plus, RefreshCw, Trash2, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { todayISO } from "@/modules/core/dates";
import { ResourceMarkdown } from "@/modules/resources/ui";
import { InviteCode } from "./ui";
import type { TeamAnnouncementDTO, TeamInformationDTO } from "./team-client";
import {
  deleteTeamAnnouncementAction, leaveTeamAction, reloadTeamInformationAction, removeTeamMemberAction,
  rotateTeamInviteAction, saveTeamAnnouncementAction, saveTeamInformationAction, type TeamSettingsFormState,
} from "./team-actions";
import type { IdentityFormState } from "./actions";

export function TeamSectionLinks({ teamId, current }: { teamId: string; current: "projects" | "members" | "settings" | "resources" | "assets" }) {
  return <nav aria-label="团队页面" className="flex flex-wrap gap-2">
    {[
      { path: "projects", label: "团队项目" }, { path: "members", label: "成员与分工" },
      { path: "resources", label: "资料中心" }, { path: "assets", label: "资源申请" },
      { path: "settings", label: "团队信息" },
    ].map((item) => <Button key={item.path} asChild size="sm" variant={current === item.path ? "default" : "outline"}>
      <Link href={`/t/${teamId}/${item.path}`} aria-current={current === item.path ? "page" : undefined}>{item.label}</Link>
    </Button>)}
  </nav>;
}

function ManagedDialog({ title, description, pending, onClose, children, focusTitle = false }: {
  title: string; description: string; pending: boolean; onClose: () => void; children: ReactNode; focusTitle?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
      <Dialog.Content
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}
        onOpenAutoFocus={(event) => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (focusTitle && event.target instanceof HTMLElement) {
            event.preventDefault();
            event.target.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
          else (document.getElementById("team-information-heading") ?? document.getElementById("team-members-heading"))?.focus();
        }}
        className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <Dialog.Title className="pr-9 text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="mt-2 pr-5 text-sm leading-relaxed text-muted-foreground">{description}</Dialog.Description>
        <Dialog.Close asChild><Button disabled={pending} variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="关闭"><X className="h-4 w-4" /></Button></Dialog.Close>
        <div className="mt-5">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function informationFields(team: TeamInformationDTO) {
  return { name: team.name, description: team.description, website: team.website ?? "", contactEmail: team.contactEmail ?? "" };
}

function TeamInformationEditor({ initial }: { initial: TeamInformationDTO }) {
  const id = useId();
  const router = useRouter();
  const notify = useFeedback();
  const [baseline, setBaseline] = useState(initial);
  const [fields, setFields] = useState(informationFields(initial));
  const [readError, setReadError] = useState("");
  const [feedback, setFeedback] = useState<TeamSettingsFormState>(null);
  const [reading, startReading] = useTransition();
  const [, action, pending] = useActionState<TeamSettingsFormState, FormData>(async (previous, data) => {
    const result = await saveTeamInformationAction(previous, data);
    setFeedback(result);
    if (result?.saved) {
      setBaseline(result.saved);
      setFields(informationFields(result.saved));
      setReadError("");
      notify(result.ok || "团队资料已保存");
      router.refresh();
    }
    return result;
  }, null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(informationFields(baseline));
  const changedElsewhere = initial.version > baseline.version;
  const busy = pending || reading;
  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-5 rounded-xl border border-border bg-card p-5">
    <div><h2 className="text-base font-semibold">团队资料</h2><p className="mt-1 text-sm text-muted-foreground">向成员说明团队目标、公共网站和联系渠道。</p></div>
    <input type="hidden" name="teamId" value={initial.id} /><input type="hidden" name="version" value={baseline.version} />
    <fieldset disabled={busy} className="space-y-4">
      <div className="space-y-1.5"><label htmlFor={`${id}-name`} className="text-sm font-medium">团队名称</label><Input id={`${id}-name`} name="name" value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} required maxLength={80} /></div>
      <div className="space-y-1.5"><label htmlFor={`${id}-description`} className="text-sm font-medium">团队介绍</label><textarea id={`${id}-description`} name="description" value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} rows={5} maxLength={2000} placeholder="团队方向、协作目标和工作方式" className="w-full rounded-md border border-input bg-background p-3 text-sm" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor={`${id}-website`} className="text-sm font-medium">网站（选填）</label><Input id={`${id}-website`} name="website" type="url" value={fields.website} onChange={(event) => setFields({ ...fields, website: event.target.value })} maxLength={2048} placeholder="https://" /></div>
        <div className="space-y-1.5"><label htmlFor={`${id}-email`} className="text-sm font-medium">联系邮箱（选填）</label><Input id={`${id}-email`} name="contactEmail" type="email" value={fields.contactEmail} onChange={(event) => setFields({ ...fields, contactEmail: event.target.value })} maxLength={254} /></div>
      </div>
    </fieldset>
    {changedElsewhere && <p role="status" className="text-sm text-muted-foreground">团队资料已更新，当前输入仍保留。读取最新资料会替换未保存内容。</p>}
    <FormFeedback message={readError || feedback?.error} />
    {!dirty && <FormFeedback message={feedback?.ok} tone="success" />}
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Button disabled={busy || !dirty} loading={pending}>{pending ? "保存中…" : "保存团队资料"}</Button>
      <Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => setFields(informationFields(baseline))}>还原输入</Button>
      {(changedElsewhere || feedback?.error) && <Button type="button" variant="ghost" disabled={busy} loading={reading} onClick={() => startReading(async () => {
        const result = await reloadTeamInformationAction(initial.id);
        if (result?.saved) { setBaseline(result.saved); setFields(informationFields(result.saved)); setReadError(""); setFeedback(null); router.refresh(); }
        else setReadError(result?.error || "读取团队资料失败");
      })}>读取最新并替换输入</Button>}
      {dirty && <span className="text-xs text-muted-foreground">有未保存修改</span>}
    </div>
  </form>;
}

function InviteRotationDialog({ initial, onClose }: { initial: TeamInformationDTO; onClose: () => void }) {
  const id = useId();
  const notify = useFeedback();
  const router = useRouter();
  const [expiresOn, setExpiresOn] = useState(initial.inviteExpiresOn ?? "");
  const [state, action, pending] = useActionState<TeamSettingsFormState, FormData>(async (previous, data) => {
    const result = await rotateTeamInviteAction(previous, data);
    if (result?.saved) { notify(result.ok || "邀请码已刷新"); onClose(); router.refresh(); }
    return result;
  }, null);
  return <ManagedDialog title="刷新团队邀请码" description="旧码会立即失效。已有成员和项目保持原样，请将新码分享给需要加入的成员。" pending={pending} onClose={onClose}>
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
      <input type="hidden" name="teamId" value={initial.id} /><input type="hidden" name="version" value={initial.version} />
      <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">有效至（选填）</label><Input id={id} name="inviteExpiresOn" type="date" min={todayISO()} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} disabled={pending} /><p className="text-xs text-muted-foreground">留空表示长期有效；所选日期当天仍可加入。</p></div>
      <FormFeedback message={state?.error} />
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button disabled={pending} loading={pending}>{pending ? "刷新中…" : "确认刷新"}</Button></div>
    </form>
  </ManagedDialog>;
}

function TeamInvitation({ initial, canManage }: { initial: TeamInformationDTO; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const expired = Boolean(initial.inviteExpiresOn && initial.inviteExpiresOn < todayISO());
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h2 className="text-base font-semibold">邀请成员</h2><p className="mt-1 text-sm text-muted-foreground">加入后拥有组员职务，管理员可在成员页设置多项职务。</p></div>
    {expired ? <p className="text-sm text-destructive">当前邀请码已过期，请由管理员或副管理员刷新后再分享。</p> : <InviteCode code={initial.inviteCode} />}
    <p className="text-sm text-muted-foreground">{initial.inviteExpiresOn ? `有效至 ${initial.inviteExpiresOn}（含当天）` : "当前邀请码长期有效"}</p>
    {canManage ? <Button variant="outline" onClick={() => setOpen(true)}><RefreshCw className="h-4 w-4" />刷新邀请码与有效期</Button> : <p className="text-xs text-muted-foreground">邀请码与有效期由管理员或副管理员维护。</p>}
    {open && <InviteRotationDialog initial={initial} onClose={() => setOpen(false)} />}
  </section>;
}

function AnnouncementEditor({ teamId, announcement, onClose }: { teamId: string; announcement?: TeamAnnouncementDTO; onClose: () => void }) {
  const id = useId();
  const notify = useFeedback();
  const router = useRouter();
  const initial = { title: announcement?.title ?? "", body: announcement?.body ?? "", pinned: announcement?.pinned ?? false };
  const [fields, setFields] = useState(initial);
  const [discard, setDiscard] = useState(false);
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(async (previous, data) => {
    const result = await saveTeamAnnouncementAction(previous, data);
    if (result?.ok) { notify(result.ok); onClose(); router.refresh(); }
    return result;
  }, null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  function close() { if (dirty) setDiscard(true); else onClose(); }
  return <ManagedDialog title={announcement ? "编辑公告" : "发布团队公告"} description="公告对团队成员可见，适合发布协作约定、通知和资源说明。" pending={pending} onClose={close} focusTitle>
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      {announcement && <><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="version" value={announcement.version} /></>}
      <fieldset disabled={pending} className="space-y-4">
        <div className="space-y-1.5"><label htmlFor={`${id}-title`} className="text-sm font-medium">公告标题</label><Input id={`${id}-title`} name="title" value={fields.title} onChange={(event) => { setFields({ ...fields, title: event.target.value }); setDiscard(false); }} required maxLength={160} /></div>
        <div className="space-y-1.5"><label htmlFor={`${id}-body`} className="text-sm font-medium">公告正文</label><textarea id={`${id}-body`} name="body" value={fields.body} onChange={(event) => { setFields({ ...fields, body: event.target.value }); setDiscard(false); }} required maxLength={10000} rows={8} placeholder="填写通知，可使用 Markdown 格式" className="w-full rounded-md border border-input bg-background p-3 text-sm" /></div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" checked={fields.pinned} onChange={(event) => setFields({ ...fields, pinned: event.target.checked })} className="accent-brand" />置顶公告</label>
      </fieldset>
      {fields.body && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm text-muted-foreground">正文预览</summary><div className="mt-3"><ResourceMarkdown text={fields.body} idPrefix={`announcement-preview-${id}`} /></div></details>}
      <FormFeedback message={state?.error} />
      {discard ? <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"><p className="text-sm">公告有未保存内容，是否放弃编辑？</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setDiscard(false)}>继续编辑</Button><Button type="button" variant="destructive" disabled={pending} onClick={onClose}>放弃并关闭</Button></div></div> : <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={close}>取消</Button><Button disabled={pending || !dirty} loading={pending}>{pending ? "保存中…" : announcement ? "保存公告" : "发布公告"}</Button></div>}
    </form>
  </ManagedDialog>;
}

function AnnouncementPinButton({ announcement }: { announcement: TeamAnnouncementDTO }) {
  const notify = useFeedback();
  const router = useRouter();
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(async (previous, data) => {
    const result = await saveTeamAnnouncementAction(previous, data);
    if (result?.ok) { notify(announcement.pinned ? "公告已取消置顶" : "公告已置顶"); router.refresh(); }
    return result;
  }, null);
  return <form action={action} className="space-y-2">
    <input type="hidden" name="teamId" value={announcement.teamId} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="version" value={announcement.version} /><input type="hidden" name="title" value={announcement.title} /><input type="hidden" name="body" value={announcement.body} />
    {!announcement.pinned && <input type="hidden" name="pinned" value="on" />}
    <Button size="sm" variant="ghost" disabled={pending} loading={pending}><Pin className="h-3.5 w-3.5" />{announcement.pinned ? "取消置顶" : "置顶"}</Button>
    <FormFeedback message={state?.error} />
  </form>;
}

function AnnouncementDeleteButton({ announcement }: { announcement: TeamAnnouncementDTO }) {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Trash2 className="h-3.5 w-3.5" />删除</Button>{open && <AnnouncementDeleteDialog announcement={announcement} onClose={() => setOpen(false)} />}</>;
}

function AnnouncementDeleteDialog({ announcement, onClose }: { announcement: TeamAnnouncementDTO; onClose: () => void }) {
  const notify = useFeedback();
  const router = useRouter();
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(async (previous, data) => {
    const result = await deleteTeamAnnouncementAction(previous, data);
    if (result?.ok) { notify(result.ok); onClose(); router.refresh(); }
    return result;
  }, null);
  return <ManagedDialog title="删除团队公告" description={`将删除“${announcement.title}”。取消会保留公告。`} pending={pending} onClose={onClose}>
    <form action={action} className="space-y-4"><input type="hidden" name="teamId" value={announcement.teamId} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="version" value={announcement.version} /><FormFeedback message={state?.error} /><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button variant="destructive" disabled={pending} loading={pending}>{pending ? "删除中…" : "确认删除"}</Button></div></form>
  </ManagedDialog>;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });

function TeamAnnouncements({ teamId, announcements, canManage }: { teamId: string; announcements: TeamAnnouncementDTO[]; canManage: boolean }) {
  const [editing, setEditing] = useState<TeamAnnouncementDTO | "new" | null>(null);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">团队公告</h2><p className="mt-1 text-sm text-muted-foreground">置顶公告优先，其余按更新时间排列。</p></div>{canManage && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />发布公告</Button>}</div>
    {announcements.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="暂无团队公告" description={canManage ? "发布协作约定、近期通知或资料说明，成员可在此查看。" : "管理员或副管理员发布公告后，会在这里显示。"} actionText={canManage ? "发布公告" : undefined} onAction={() => setEditing("new")} /> : announcements.map((announcement) => <article key={announcement.id} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2"><div className="flex flex-wrap items-start gap-2"><h3 className="min-w-0 break-words text-base font-semibold [overflow-wrap:anywhere]">{announcement.title}</h3>{announcement.pinned && <Badge variant="secondary">置顶</Badge>}</div><p className="text-xs text-muted-foreground">{announcement.authorName || "团队成员"} · 更新于 <time dateTime={announcement.updatedAt}>{timeFormatter.format(new Date(announcement.updatedAt))}</time></p></div>
      <div className="max-h-96 overflow-y-auto"><ResourceMarkdown text={announcement.body} idPrefix={`announcement-${announcement.id}`} /></div>
      {canManage && <div className="flex flex-wrap items-start gap-2 border-t border-border pt-3"><Button size="sm" variant="outline" onClick={() => setEditing(announcement)}>编辑</Button><AnnouncementPinButton key={`${announcement.id}-${announcement.version}`} announcement={announcement} /><AnnouncementDeleteButton announcement={announcement} /></div>}
    </article>)}
    {editing && <AnnouncementEditor teamId={teamId} announcement={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
  </section>;
}

export function TeamMemberRemovalButton({ teamId, userId, name, self = false }: { teamId: string; userId?: string; name: string; self?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{self ? <LogOut className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}{self ? "退出团队" : "移除成员"}</Button>{open && <TeamMemberRemovalDialog teamId={teamId} userId={userId} name={name} self={self} onClose={() => setOpen(false)} />}</>;
}

function TeamMemberRemovalDialog({ teamId, userId, name, self, onClose }: { teamId: string; userId?: string; name: string; self: boolean; onClose: () => void }) {
  const notify = useFeedback();
  const router = useRouter();
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(async (previous, data) => {
    const result = await (self ? leaveTeamAction(previous, data) : removeTeamMemberAction(previous, data));
    if (result?.ok) { notify(result.ok); onClose(); router.refresh(); }
    return result;
  }, null);
  return <ManagedDialog title={self ? "退出团队" : "移除团队成员"} description={self ? `退出“${name}”后，将无法访问团队项目和共享资料。历史署名与记录保留。` : `将“${name}”移出团队，该成员将失去团队项目和资料的访问权限。历史署名与记录保留。`} pending={pending} onClose={onClose}>
    <form action={action} className="space-y-4"><input type="hidden" name="teamId" value={teamId} />{!self && <input type="hidden" name="userId" value={userId} />}<p className="text-sm leading-relaxed text-muted-foreground">仍负责未完成任务的成员需先转交或退回任务池。团队至少保留一位管理员。</p><FormFeedback message={state?.error} /><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button variant="destructive" disabled={pending} loading={pending}>{pending ? "处理中…" : self ? "确认退出" : "确认移除"}</Button></div></form>
  </ManagedDialog>;
}

export function TeamSettingsWorkspace({ information, announcements, canManage, memberCount, projectCount }: {
  information: TeamInformationDTO; announcements: TeamAnnouncementDTO[]; canManage: boolean; memberCount: number; projectCount: number;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("section");
  const section = requested === "announcements" || requested === "invite" ? requested : "information";
  return <main className="min-w-0 space-y-6">
    <header className="space-y-2"><Link href="/t" className="text-xs text-muted-foreground hover:text-brand">团队空间 /</Link><h1 id="team-information-heading" tabIndex={-1} className="break-words text-2xl font-semibold [overflow-wrap:anywhere]">{information.name} · 团队信息</h1><p className="text-sm text-muted-foreground">{memberCount} 位成员 · {projectCount} 个项目 · {canManage ? "你可以维护资料、公告和邀请" : "查看团队资料、公告和邀请信息"}</p></header>
    <TeamSectionLinks teamId={information.id} current="settings" />
    <Tabs.Root value={section} onValueChange={(value) => router.replace(`/t/${information.id}/settings?section=${value}`, { scroll: false })} className="space-y-5">
      <Tabs.List aria-label="团队信息分区" className="flex flex-wrap gap-1 border-b border-border pb-2">{[{ id: "information", label: "团队资料" }, { id: "announcements", label: `公告 ${announcements.length}` }, { id: "invite", label: "成员邀请" }].map((item) => <Tabs.Trigger key={item.id} value={item.id} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-brand-soft data-[state=active]:text-brand">{item.label}</Tabs.Trigger>)}</Tabs.List>
      <Tabs.Content value="information" forceMount className="space-y-5 data-[state=inactive]:hidden">
        {canManage ? <TeamInformationEditor initial={information} /> : <section className="space-y-4 rounded-xl border border-border bg-card p-5"><h2 className="text-base font-semibold">团队资料</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{information.description || "尚未填写团队介绍。"}</p><dl className="grid gap-4 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-muted-foreground">网站</dt><dd className="mt-1 break-words">{information.website ? <a href={information.website} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline [overflow-wrap:anywhere]">{information.website}</a> : "未填写"}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">联系邮箱</dt><dd className="mt-1 break-words [overflow-wrap:anywhere]">{information.contactEmail || "未填写"}</dd></div></dl><p className="text-xs text-muted-foreground">团队资料由管理员或副管理员维护。</p></section>}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="text-base font-semibold">团队共享资料</h2><p className="text-sm text-muted-foreground">在资料中心保存团队文档、文件和整理版本，团队成员共享访问。</p><Button asChild variant="outline"><Link href={`/t/${information.id}/resources`}><FileText className="h-4 w-4" />进入资料中心</Link></Button></section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="text-base font-semibold">团队成员关系</h2><p className="text-sm text-muted-foreground">退出前请转交负责的未完成任务，并完成必要的管理员交接。</p><TeamMemberRemovalButton teamId={information.id} name={information.name} self /></section>
      </Tabs.Content>
      <Tabs.Content value="announcements" forceMount className="data-[state=inactive]:hidden"><TeamAnnouncements teamId={information.id} announcements={announcements} canManage={canManage} /></Tabs.Content>
      <Tabs.Content value="invite" forceMount className="data-[state=inactive]:hidden"><TeamInvitation initial={information} canManage={canManage} /></Tabs.Content>
    </Tabs.Root>
  </main>;
}

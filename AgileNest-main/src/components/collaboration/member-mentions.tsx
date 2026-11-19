"use client";

import { useId, useState } from "react";
import { AtSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MentionMember = { userId: string; name: string };
export function MemberMentions({ members, value, onChange, disabled }: {
  members: MentionMember[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const id = useId();
  const visible = members.filter((member) => member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="space-y-2">
    {!!value.length && <div className="flex flex-wrap gap-2" aria-label="已提及成员">{value.map((userId) => <span key={userId} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-xs text-brand">@{members.find((member) => member.userId === userId)?.name ?? "已离队成员"}<Button type="button" size="icon" variant="ghost" className="h-5 w-5" disabled={disabled} aria-label={`移除提及 ${members.find((member) => member.userId === userId)?.name ?? "已离队成员"}`} onClick={() => onChange(value.filter((item) => item !== userId))}><X className="h-3 w-3" /></Button></span>)}</div>}
    <details className="rounded-lg border border-border bg-background">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><AtSign className="h-3.5 w-3.5" />提及团队成员 <span className="text-muted-foreground">{value.length}/20</span></summary>
      <div className="space-y-2 border-t border-border p-3">
        <label htmlFor={`${id}-search`} className="sr-only">按姓名搜索提及成员</label><input id={`${id}-search`} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/30" placeholder="搜索姓名" value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled} />
        <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">{visible.map((member) => <label key={member.userId} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"><input type="checkbox" checked={value.includes(member.userId)} disabled={disabled || value.length >= 20 && !value.includes(member.userId)} onChange={(event) => onChange(event.target.checked ? [...value, member.userId] : value.filter((item) => item !== member.userId))} /><span className="truncate">{member.name}</span></label>)}</div>
        {!visible.length && <p className="text-xs text-muted-foreground">没有匹配的团队成员</p>}
        <p className="text-xs leading-5 text-muted-foreground">所选成员按通知偏好收到站内提醒；输入同名文字不会自动提及。</p>
      </div>
    </details>
  </div>;
}

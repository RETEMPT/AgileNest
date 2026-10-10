"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Bot, FolderKanban, GraduationCap, Link2, Palette, UserRound } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { settingsSection, type SettingsSection } from "./settings-sections";

const SECTIONS = [
  { id: "profile", label: "个人资料", icon: UserRound, group: "账号" },
  { id: "academic", label: "学术身份", icon: GraduationCap },
  { id: "projects", label: "参与项目", icon: FolderKanban },
  { id: "ai", label: "AI 助手", icon: Bot, group: "偏好设置" },
  { id: "appearance", label: "主题外观", icon: Palette },
  { id: "connections", label: "账号连接", icon: Link2 },
] as const;
export function SettingsWorkspace({ profile, joinedAt, initialSection, panels }: {
  profile: { name: string; email: string; avatarUrl: string | null };
  joinedAt: string;
  initialSection: SettingsSection;
  panels: Record<SettingsSection, ReactNode>;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [requestedSection, setRequestedSection] = useState<SettingsSection>(initialSection);
  // A soft navigation can request another section without remounting this workspace.
  if (initialSection !== requestedSection) { setRequestedSection(initialSection); setSection(initialSection); }
  useEffect(() => {
    const onPopState = () => setSection(settingsSection(new URL(window.location.href).searchParams.get("section") ?? undefined));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return (
    <Tabs.Root orientation="vertical" value={section} onValueChange={(value) => {
      setSection(settingsSection(value));
      const url = new URL(window.location.href);
      url.searchParams.set("section", value);
      window.history.pushState(null, "", url);
    }} className="flex min-h-[calc(100dvh-3.5rem)] flex-col md:min-h-dvh md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-background/70 md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
        <div className="border-b border-border px-5 py-5 md:py-6">
          <h1 className="text-base font-semibold">个人中心</h1>
        </div>
        <div className="hidden items-center gap-3 px-5 py-6 md:flex">
          <UserAvatar name={profile.name} src={profile.avatarUrl} className="h-10 w-10" />
          <div className="min-w-0"><p className="truncate text-sm font-medium">{profile.name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{profile.email}</p></div>
        </div>
        <Tabs.List aria-label="个人中心分区" className="flex flex-wrap gap-1 p-3 md:flex-col md:px-3 md:pt-0">
          {SECTIONS.map(({ id, label, icon: Icon, ...rest }) => (
            <div key={id} className="md:w-full">
              {"group" in rest && <p className="hidden px-3 pt-4 pb-2 text-[11px] text-muted-foreground md:block">{rest.group}</p>}
              <Tabs.Trigger value={id} className="ui-press flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-brand-soft data-[state=active]:font-medium data-[state=active]:text-brand">
                <Icon size={16} aria-hidden="true" />{label}
              </Tabs.Trigger>
            </div>
          ))}
        </Tabs.List>
        <p className="mt-auto hidden border-t border-border/70 px-6 py-5 text-[11px] text-muted-foreground md:block">加入于 {joinedAt}</p>
      </aside>
      <div className="min-w-0 flex-1 bg-card px-4 py-6 sm:px-7 md:px-10 md:py-9">
        {SECTIONS.map(({ id }) => <Tabs.Content key={id} value={id} forceMount className="panel-enter max-w-4xl outline-none data-[state=inactive]:hidden">{panels[id]}</Tabs.Content>)}
        <p className="mt-8 text-[11px] text-muted-foreground md:hidden">加入于 {joinedAt}</p>
      </div>
    </Tabs.Root>
  );
}

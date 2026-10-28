"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import packageMetadata from "../../package.json";
import { UserAvatar } from "./ui/user-avatar";
import { Button } from "./ui/button";
import { browserSidebarProjectStore, resolveSidebarProject } from "./sidebar-project";
import {
  LogoIcon, WorkbenchIcon, AiChatIcon, TeamIcon, TasksIcon, CalendarIcon,
  MilestoneIcon, ReviewIcon, StatsIcon, NotifyIcon, SettingsIcon, GuideIcon,
  ProjectFolderIcon, LogoutIcon, ChevronDownIcon, MenuIcon,
  SidebarCollapseIcon, SidebarExpandIcon,
} from "@/components/icons";
import { Check, Files, PackageCheck, Bookmark, MessageSquare, Boxes } from "lucide-react";

export type ProjectSummary = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  kind?: string | null;
};

type AppSidebarProps = {
  user: { id: string; name?: string | null; email?: string | null; avatarUrl?: string | null };
  projects: ProjectSummary[];
  onSignOut: () => Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

type SidebarContentProps = AppSidebarProps & {
  pathname: string;
  project: ProjectSummary | undefined;
  onSelectProject: (projectId: string) => void;
  collapsed: boolean;
  closeMobile: () => void;
  projectButtonRef: RefObject<HTMLButtonElement | null>;
  restoreNavigationFocus: () => void;
};

function SidebarContent({ user, projects, onSignOut, onToggleCollapse, pathname, project, onSelectProject, collapsed, closeMobile, projectButtonRef, restoreNavigationFocus }: SidebarContentProps) {
  const name = user.name || "用户";
  const [projectMenuPath, setProjectMenuPath] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const projectMenuOpen = projectMenuPath === pathname;
  if (projectMenuPath !== null && projectMenuPath !== pathname) setProjectMenuPath(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeProjectMenu = () => setProjectMenuPath(null);
    desktop.addEventListener("change", closeProjectMenu);
    return () => desktop.removeEventListener("change", closeProjectMenu);
  }, []);
  const workspaceItems = [
    { href: "/home", label: "工作台", icon: WorkbenchIcon, active: pathname === "/home" || pathname.startsWith("/home/") },
    { href: "/t", label: "团队空间", icon: TeamIcon, active: pathname === "/t" || pathname.startsWith("/t/") },
    { href: "/calendar", label: "我的日历", icon: CalendarIcon, active: pathname === "/calendar" },
    { href: "/ai", label: "AI 对话", icon: AiChatIcon, active: pathname === "/ai" },
  ];
  const projectItems = project ? [
    { href: `/p/${project.id}`, label: "项目概览", icon: ProjectFolderIcon, active: pathname === `/p/${project.id}` },
    { href: `/p/${project.id}/board`, label: "任务", icon: TasksIcon, active: ["tasks", "board", "table"].some((view) => pathname === `/p/${project.id}/${view}` || pathname.startsWith(`/p/${project.id}/${view}/`)) },
    { href: `/p/${project.id}/calendar`, label: "项目日历", icon: CalendarIcon, active: pathname === `/p/${project.id}/calendar` },
    { href: `/p/${project.id}/milestones`, label: "里程碑", icon: MilestoneIcon, active: pathname === `/p/${project.id}/milestones` },
    { href: `/p/${project.id}/review`, label: "验收", icon: ReviewIcon, active: pathname === `/p/${project.id}/review` },
    { href: `/p/${project.id}/resources`, label: "项目资料", icon: (props: Parameters<typeof ProjectFolderIcon>[0]) => <Files {...props} />, active: pathname === `/p/${project.id}/resources` },
    { href: `/p/${project.id}/delivery`, label: "阶段交付", icon: (props: Parameters<typeof ProjectFolderIcon>[0]) => <PackageCheck {...props} />, active: pathname === `/p/${project.id}/delivery` },
    { href: `/p/${project.id}/comments`, label: "项目评论", icon: (props: Parameters<typeof ProjectFolderIcon>[0]) => <MessageSquare {...props} />, active: pathname === `/p/${project.id}/comments` },
    { href: `/p/${project.id}/stats`, label: "成员贡献", icon: StatsIcon, active: pathname === `/p/${project.id}/stats` },
    { href: `/t/${project.teamId}/assets`, label: "资源申请", icon: (props: Parameters<typeof ProjectFolderIcon>[0]) => <Boxes {...props} />, active: pathname === `/t/${project.teamId}/assets` },
  ] : [];
  const accountItems = [
    { href: "/favorites", label: "我的收藏", icon: (props: Parameters<typeof ProjectFolderIcon>[0]) => <Bookmark {...props} />, active: pathname === "/favorites" },
    { href: "/notifications", label: "消息中心", icon: NotifyIcon, active: pathname === "/notifications" },
    { href: "/settings", label: "个人中心", icon: SettingsIcon, active: pathname === "/settings" },
    { href: "/guide", label: "使用指引", icon: GuideIcon, active: pathname === "/guide" },
  ];
  const query = projectSearch.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter((item) => item.name.toLocaleLowerCase().includes(query) || item.teamName.toLocaleLowerCase().includes(query));

  function links(items: typeof workspaceItems, label: string) {
    return <nav aria-label={label} className="space-y-1">{items.map(({ href, label: title, icon: Icon, active }) => (
      <Link key={href} href={href} onClick={closeMobile} aria-label={title} aria-current={active ? "page" : undefined} title={collapsed ? title : undefined}
        className={`sidebar-link flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-accent hover:text-foreground"} ${collapsed ? "justify-center px-0" : ""}`}>
        <Icon size={18} aria-hidden="true" className="shrink-0" />
        <span className={collapsed ? "sr-only" : "truncate"}>{title}</span>
      </Link>
    ))}</nav>;
  }

  return <>
    <div className={`flex h-14 shrink-0 items-center border-b border-border px-3 ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
      {!collapsed && <Link href="/home" onClick={closeMobile} className="flex min-w-0 items-center gap-2 font-display text-lg font-semibold"><LogoIcon size={22} className="shrink-0 text-brand" /><span>AgileNest</span></Link>}
      <Button variant="ghost" size="icon" className={collapsed ? undefined : "hidden md:inline-flex"} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={onToggleCollapse}>
        {collapsed ? <SidebarExpandIcon size={18} /> : <SidebarCollapseIcon size={18} />}
      </Button>
    </div>
    <div className="border-b border-border p-3">
      <DropdownMenu.Root open={projectMenuOpen} onOpenChange={(open) => { setProjectMenuPath(open ? pathname : null); if (!open) setProjectSearch(""); }}>
        <DropdownMenu.Trigger asChild>
          <button ref={projectButtonRef} type="button" aria-label={project ? `切换项目：${project.name}` : "选择项目"} title={collapsed ? project?.name || "选择项目" : undefined}
            className={`flex min-h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent ${collapsed ? "justify-center px-0" : ""}`}>
            <ProjectFolderIcon size={18} aria-hidden="true" className="shrink-0 text-brand" />
            {!collapsed && <><span className="min-w-0 flex-1"><span className="block truncate font-medium">{project?.name || "选择项目"}</span><span className="block truncate text-xs text-muted-foreground">{project?.teamName || (projects.length ? "选择已有项目以显示导航" : "创建或加入团队后开始")}</span></span><ChevronDownIcon size={14} className="shrink-0" /></>}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} collisionPadding={12} onCloseAutoFocus={(event) => {
            if (!projectButtonRef.current?.getClientRects().length) {
              event.preventDefault();
              restoreNavigationFocus();
            }
          }} className="z-[70] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
            <DropdownMenu.Label className="px-3 py-2 text-xs text-muted-foreground">选择项目</DropdownMenu.Label>
            <div className="px-2 pb-1">
              <input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} placeholder="搜索项目名称" aria-label="搜索项目名称" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {projects.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">暂无项目，可先创建或加入团队。</p>}
            {projects.length > 0 && !visibleProjects.length && <p className="px-3 py-3 text-sm text-muted-foreground">没有匹配的项目。</p>}
            {visibleProjects.map((item) => <DropdownMenu.Item key={item.id} asChild>
              <Link href={`/p/${item.id}/board`} onClick={closeMobile} onNavigate={() => onSelectProject(item.id)} aria-current={item.id === project?.id ? "true" : undefined}
                className="flex min-h-11 flex-col gap-0.5 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <span className="flex w-full items-start gap-2"><span className="min-w-0 flex-1 break-words font-medium">{item.name}</span>{item.id === project?.id && <><Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" /><span className="sr-only">当前项目</span></>}</span><span className="text-xs text-muted-foreground">{item.teamName}</span>
              </Link>
            </DropdownMenu.Item>)}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild><Link href="/t" onClick={closeMobile} className="block rounded-lg px-3 py-2 text-sm text-brand outline-none data-[highlighted]:bg-accent">管理团队与项目</Link></DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3">
      <div>{!collapsed && <p className="mb-2 px-3 text-xs text-muted-foreground">工作空间</p>}{links(workspaceItems, "工作空间")}</div>
      <div>{!collapsed && <p className="mb-2 px-3 text-xs text-muted-foreground">{project ? "当前项目" : "项目"}</p>}
        {project ? links(projectItems, "当前项目") : projects.length ?
          <button type="button" onClick={() => setProjectMenuPath(pathname)} aria-label="选择已有项目" title={collapsed ? "选择已有项目" : undefined} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-brand hover:bg-brand-soft ${collapsed ? "justify-center px-0" : ""}`}><ProjectFolderIcon size={18} aria-hidden="true" className="shrink-0" /><span className={collapsed ? "sr-only" : ""}>选择已有项目</span></button> :
          <Link href="/t" onClick={closeMobile} aria-label="创建或加入团队项目" title={collapsed ? "创建或加入团队项目" : undefined} className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-brand hover:bg-brand-soft ${collapsed ? "justify-center px-0" : ""}`}><ProjectFolderIcon size={18} aria-hidden="true" className="shrink-0" /><span className={collapsed ? "sr-only" : ""}>创建或加入团队项目</span></Link>}
      </div>
      <div>{!collapsed && <p className="mb-2 px-3 text-xs text-muted-foreground">个人</p>}{links(accountItems, "个人设置与消息")}</div>
    </div>
    <div className="shrink-0 border-t border-border p-3">
      <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
        <Link href="/settings" onClick={closeMobile} aria-label={`编辑 ${name} 的个人资料`}><UserAvatar name={name} src={user.avatarUrl} className="h-8 w-8 text-xs" /></Link>
        {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="truncate text-xs text-muted-foreground">v{packageMetadata.version}</p></div>}
        <form action={onSignOut}><Button type="submit" variant="ghost" size="icon" aria-label="退出登录"><LogoutIcon size={18} /></Button></form>
      </div>
    </div>
  </>;
}

export function AppSidebar(props: AppSidebarProps) {
  const pathname = usePathname();
  const projectStore = useMemo(() => browserSidebarProjectStore(props.user.id), [props.user.id]);
  const rememberedId = useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot, () => null);
  const project = resolveSidebarProject(pathname, props.projects, rememberedId);
  const routeProjectId = resolveSidebarProject(pathname, props.projects, null)?.id;
  useEffect(() => {
    if (routeProjectId) projectStore.select(routeProjectId);
  }, [projectStore, routeProjectId]);
  useEffect(() => {
    const savedId = projectStore.getSnapshot();
    if (!props.projects.some((item) => item.id === savedId)) projectStore.select(null);
  }, [props.projects, projectStore, rememberedId]);
  const [mobilePath, setMobilePath] = useState<string | null>(null);
  const mobileOpen = mobilePath === pathname;
  if (mobilePath !== null && mobilePath !== pathname) setMobilePath(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const desktopProjectButton = useRef<HTMLButtonElement>(null);
  const mobileProjectButton = useRef<HTMLButtonElement>(null);
  const restoreNavigationFocus = () => {
    const target = window.matchMedia("(min-width: 768px)").matches ? desktopProjectButton : menuButton;
    target.current?.focus();
  };
  const closeMobile = () => setMobilePath(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobilePath(null); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return <>
    <Dialog.Root open={mobileOpen} onOpenChange={(open) => setMobilePath(open ? pathname : null)}>
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Link href="/home" className="flex items-center gap-2 font-display text-base font-semibold"><LogoIcon size={20} className="text-brand" />AgileNest</Link>
        <Dialog.Trigger asChild><Button ref={menuButton} variant="ghost" size="icon" aria-label="打开导航菜单"><MenuIcon size={20} /></Button></Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40 md:hidden" />
        <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); restoreNavigationFocus(); }} className="drawer-left-surface fixed inset-y-0 left-0 z-[60] flex w-72 max-w-[calc(100vw-2.5rem)] flex-col border-r border-border bg-card md:hidden">
          <Dialog.Title className="sr-only">AgileNest 导航</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label="关闭导航菜单">×</Button></Dialog.Close>
          <SidebarContent {...props} pathname={pathname} project={project} onSelectProject={projectStore.select} collapsed={false} closeMobile={closeMobile} projectButtonRef={mobileProjectButton} restoreNavigationFocus={restoreNavigationFocus} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <aside aria-label="主导航" data-collapsed={props.isCollapsed || false} className={`sidebar-surface fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card md:flex ${props.isCollapsed ? "w-18" : "w-60"}`}>
      <SidebarContent {...props} pathname={pathname} project={project} onSelectProject={projectStore.select} collapsed={props.isCollapsed || false} closeMobile={closeMobile} projectButtonRef={desktopProjectButton} restoreNavigationFocus={restoreNavigationFocus} />
    </aside>
  </>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogoIcon,
  WorkbenchIcon,
  TeamIcon,
  TasksIcon,
  BoardIcon,
  TableIcon,
  CalendarIcon,
  MilestoneIcon,
  ReviewIcon,
  StatsIcon,
  NotifyIcon,
  SettingsIcon,
  ProjectFolderIcon,
  LogoutIcon,
  ChevronDownIcon,
  MenuIcon,
} from "@/components/icons";

export type ProjectSummary = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  kind?: string | null;
};

type AppSidebarProps = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  projects: ProjectSummary[];
  onSignOut: () => Promise<void>;
};

export function AppSidebar({ user, projects, onSignOut }: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const displayName = user.name || "用户";
  const displayEmail = user.email || "";


  // 解析当前路由中的 projectId（如果处于 /p/[projectId] 下）
  const projectMatch = pathname.match(/^\/p\/([^/]+)/);
  const currentProjectId = projectMatch ? projectMatch[1] : null;

  // 当前激活的项目（若不在项目页，则默认取第 1 个项目作为快捷上下文）
  const activeProject =
    projects.find((p) => p.id === currentProjectId) ?? projects[0] ?? null;
  const activeProjectId = activeProject?.id;

  const isHomeActive = pathname === "/home" || pathname.startsWith("/home/");
  const isTeamActive = pathname === "/t" || pathname.startsWith("/t/");
  const isSettingsActive = pathname === "/settings";

  // 项目各独立系统的入口配置
  const projectNavItems = activeProjectId
    ? [
        {
          href: `/p/${activeProjectId}/tasks`,
          label: "任务池 (状态机)",
          icon: TasksIcon,
          tag: "tasks",
        },
        {
          href: `/p/${activeProjectId}/board`,
          label: "多维看板",
          icon: BoardIcon,
          tag: "board",
        },
        {
          href: `/p/${activeProjectId}/table`,
          label: "结构表格",
          icon: TableIcon,
          tag: "table",
        },
        {
          href: `/p/${activeProjectId}/calendar`,
          label: "教学日程",
          icon: CalendarIcon,
          tag: "calendar",
        },
        {
          href: `/p/${activeProjectId}/milestones`,
          label: "教学里程碑",
          icon: MilestoneIcon,
          tag: "milestone",
        },
        {
          href: `/p/${activeProjectId}/review`,
          label: "验收审核台",
          icon: ReviewIcon,
          tag: "review",
        },
        {
          href: `/p/${activeProjectId}/stats`,
          label: "工时与贡献",
          icon: StatsIcon,
          tag: "stats",
        },
      ]
    : [];

  return (
    <>
      {/* 移动端顶部轻量栏 */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Link href="/home" className="flex items-center gap-2 font-display text-base font-bold">
          <LogoIcon size={20} />
          <span>AgileNest</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="Toggle Navigation"
        >
          <MenuIcon size={20} />
        </button>
      </div>

      {/* 遮罩层 (移动端) */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* 侧栏主体 (响应式抽屉 / 桌面固定) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:translate-x-0 will-change-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* 1. 品牌与顶头 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <Link
            href="/home"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-foreground"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <LogoIcon size={20} />
            </div>
            <span>AgileNest</span>
          </Link>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            v0.2
          </span>
        </div>

        {/* 2. 项目协调选择器 (Project Switcher) */}
        <div className="relative border-b border-border p-3">
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-xs transition hover:bg-accent/60"
          >
            <div className="flex items-center gap-2 truncate">
              <ProjectFolderIcon size={16} className="shrink-0 text-blue-600" />
              <div className="truncate">
                <p className="truncate font-semibold text-foreground">
                  {activeProject ? activeProject.name : "未选择项目"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {activeProject ? activeProject.teamName : "点击切换或新建"}
                </p>
              </div>
            </div>
            <ChevronDownIcon size={14} className="shrink-0 text-muted-foreground" />
          </button>

          {/* 项目切换浮层 */}
          {switcherOpen && (
            <div
              className="absolute top-full left-3 right-3 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
              onMouseLeave={() => setSwitcherOpen(false)}
            >
              <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                我的团队项目
              </div>
              {projects.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">暂无项目</div>
              ) : (
                projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/p/${p.id}`}
                    onClick={() => {
                      setSwitcherOpen(false);
                      setMobileOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                      p.id === activeProjectId
                        ? "bg-accent font-medium text-accent-foreground"
                        : "hover:bg-accent/50 text-foreground"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{p.teamName}</span>
                  </Link>
                ))
              )}
              <div className="my-1 border-t border-border" />
              <Link
                href="/t"
                onClick={() => {
                  setSwitcherOpen(false);
                  setMobileOpen(false);
                }}
                className="block rounded-lg px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50/60 dark:hover:bg-blue-950/30"
              >
                + 管理与新建团队项目 →
              </Link>
            </div>
          )}
        </div>

        {/* 3. 核心侧栏滚动导航区 */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
          {/* 工作台分类 */}
          <div>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              核心工作台
            </div>
            <nav className="space-y-0.5">
              <Link
                href="/home"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isHomeActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <WorkbenchIcon
                  size={16}
                  className={isHomeActive ? "text-background" : "text-blue-600"}
                />
                <span>今日工作台</span>
              </Link>
              <Link
                href="/t"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isTeamActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <TeamIcon
                  size={16}
                  className={isTeamActive ? "text-background" : "text-blue-600"}
                />
                <span>团队与空间</span>
              </Link>
            </nav>
          </div>

          {/* 分支独立化业务系统 */}
          <div>
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                项目业务系统
              </span>
              {activeProject && (
                <span className="truncate max-w-[90px] text-[10px] text-muted-foreground">
                  {activeProject.name}
                </span>
              )}
            </div>

            {projectNavItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                <p>尚未加入任何项目</p>
                <Link href="/t" className="mt-1 block text-blue-600 hover:underline">
                  去创建或加入 →
                </Link>
              </div>
            ) : (
              <nav className="space-y-0.5">
                {projectNavItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          size={16}
                          className={isActive ? "text-background" : "text-blue-600"}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.tag && (
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] uppercase tracking-wide ${
                            isActive
                              ? "bg-background/20 text-background"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.tag}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          {/* 系统与设置分类 */}
          <div>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              管理与设置
            </div>
            <nav className="space-y-0.5">
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isSettingsActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <NotifyIcon
                  size={16}
                  className={isSettingsActive ? "text-background" : "text-blue-600"}
                />
                <span>消息与飞书集成</span>
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isSettingsActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <SettingsIcon
                  size={16}
                  className={isSettingsActive ? "text-background" : "text-blue-600"}
                />
                <span>系统偏好设置</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* 4. 底部个人资料与快速退出 */}
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 p-2">
            <div className="flex items-center gap-2.5 truncate">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="truncate text-left">
                <p className="truncate text-xs font-semibold text-foreground">{displayName}</p>
                {displayEmail && (
                  <p className="truncate text-[10px] text-muted-foreground">{displayEmail}</p>
                )}
              </div>
            </div>
            <form action={onSignOut}>
              <button
                type="submit"
                title="退出登录"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition"
              >
                <LogoutIcon size={14} className="text-muted-foreground" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}

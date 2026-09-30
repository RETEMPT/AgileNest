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
  SidebarCollapseIcon,
  SidebarExpandIcon,
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function AppSidebar({
  user,
  projects,
  onSignOut,
  isCollapsed = false,
  onToggleCollapse,
}: AppSidebarProps) {
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

      {/* 侧栏主体 (支持可折叠桌面侧栏 & 移动端全宽滑出) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:translate-x-0 will-change-transform ${
          isCollapsed ? "md:w-18" : "md:w-64"
        } ${mobileOpen ? "translate-x-0 w-64" : "-translate-x-full w-64"}`}
      >
        {/* 1. 品牌与顶头 */}
        <div className="flex h-16 shrink-0 items-center border-b border-border px-3 sm:px-4">
          {/* 桌面端折叠态：居中单体图标按钮，悬浮切换展开箭头，彻底消除重叠 */}
          {isCollapsed ? (
            <div className="hidden md:flex w-full items-center justify-center">
              {onToggleCollapse ? (
                <button
                  onClick={onToggleCollapse}
                  title="展开侧栏 (Ctrl+B)"
                  className="group relative flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50/70 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/60 transition shadow-2xs"
                >
                  <span className="group-hover:hidden transition-transform">
                    <LogoIcon size={20} />
                  </span>
                  <span className="hidden group-hover:inline-block transition-transform">
                    <SidebarExpandIcon size={18} />
                  </span>
                </button>
              ) : (
                <Link
                  href="/home"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50/70 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  title="AgileNest 首页"
                >
                  <LogoIcon size={20} />
                </Link>
              )}
            </div>
          ) : null}

          {/* 展开态（以及移动端）：完整品牌 + 版本号 + 收起按钮 */}
          <div
            className={`flex w-full items-center justify-between ${
              isCollapsed ? "md:hidden" : ""
            }`}
          >
            <Link
              href="/home"
              className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-foreground truncate"
              title="AgileNest 首页"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <LogoIcon size={20} />
              </div>
              <span className="truncate">AgileNest</span>
            </Link>

            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                v0.2
              </span>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="收起侧栏 (Ctrl+B)"
                  className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  <SidebarCollapseIcon size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. 项目协调选择器 (Project Switcher) */}
        <div className="relative border-b border-border p-2 sm:p-3">
          {isCollapsed ? (
            <button
              onClick={() => setSwitcherOpen(!switcherOpen)}
              title={activeProject ? `当前项目: ${activeProject.name}` : "选择项目"}
              className="hidden md:flex mx-auto h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-background hover:bg-accent text-blue-600 transition"
            >
              <ProjectFolderIcon size={16} />
            </button>
          ) : (
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
                    {activeProject ? activeProject.teamName : "点击切换项目上下文"}
                  </p>
                </div>
              </div>
              <ChevronDownIcon
                size={14}
                className={`text-muted-foreground transition-transform duration-200 ${
                  switcherOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          {/* 移动端常驻展示完整项目按钮 */}
          <div className="md:hidden">
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
                    {activeProject ? activeProject.teamName : "点击切换项目上下文"}
                  </p>
                </div>
              </div>
              <ChevronDownIcon
                size={14}
                className={`text-muted-foreground transition-transform duration-200 ${
                  switcherOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* 浮动下拉菜单 */}
          {switcherOpen && (
            <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg text-xs custom-scrollbar">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                选择项目上下文
              </div>
              {projects.length === 0 ? (
                <div className="p-2 text-center text-muted-foreground text-xs">
                  暂无项目，前往团队新建
                </div>
              ) : (
                projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/p/${p.id}/tasks`}
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
        <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-4 space-y-6 custom-scrollbar">
          {/* 工作台分类 */}
          <div>
            <div
              className={`px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase ${
                isCollapsed ? "md:hidden" : ""
              }`}
            >
              核心工作台
            </div>
            <nav className="space-y-0.5">
              <Link
                href="/home"
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? "今日工作台" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isHomeActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                } ${isCollapsed ? "md:justify-center md:px-0" : ""}`}
              >
                <WorkbenchIcon
                  size={16}
                  className={isHomeActive ? "text-background" : "text-blue-600"}
                />
                <span className={isCollapsed ? "md:hidden" : ""}>今日工作台</span>
              </Link>
              <Link
                href="/t"
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? "团队空间" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isTeamActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                } ${isCollapsed ? "md:justify-center md:px-0" : ""}`}
              >
                <TeamIcon
                  size={16}
                  className={isTeamActive ? "text-background" : "text-blue-600"}
                />
                <span className={isCollapsed ? "md:hidden" : ""}>团队空间</span>
              </Link>
            </nav>
          </div>

          {/* 当前项目系统分类 */}
          <div>
            <div
              className={`flex items-center justify-between px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase ${
                isCollapsed ? "md:hidden" : ""
              }`}
            >
              <span>项目系统</span>
              {activeProject && (
                <span className="max-w-[100px] truncate text-[10px] font-normal text-muted-foreground">
                  {activeProject.name}
                </span>
              )}
            </div>

            {!activeProjectId ? (
              <p
                className={`px-2.5 text-xs text-muted-foreground italic ${
                  isCollapsed ? "md:hidden" : ""
                }`}
              >
                请先选择或创建一个项目
              </p>
            ) : (
              <nav className="space-y-0.5">
                {projectNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={isCollapsed ? item.label : undefined}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      } ${isCollapsed ? "md:justify-center md:px-0" : ""}`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon
                          size={16}
                          className={isActive ? "text-background" : "text-blue-600"}
                        />
                        <span className={`truncate ${isCollapsed ? "md:hidden" : ""}`}>
                          {item.label}
                        </span>
                      </div>
                      {item.tag && (
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] uppercase tracking-wide ${
                            isCollapsed ? "md:hidden" : ""
                          } ${
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
            <div
              className={`px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase ${
                isCollapsed ? "md:hidden" : ""
              }`}
            >
              管理与设置
            </div>
            <nav className="space-y-0.5">
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? "消息与飞书集成" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isSettingsActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                } ${isCollapsed ? "md:justify-center md:px-0" : ""}`}
              >
                <NotifyIcon
                  size={16}
                  className={isSettingsActive ? "text-background" : "text-blue-600"}
                />
                <span className={isCollapsed ? "md:hidden" : ""}>消息与飞书集成</span>
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? "系统偏好设置" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  isSettingsActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                } ${isCollapsed ? "md:justify-center md:px-0" : ""}`}
              >
                <SettingsIcon
                  size={16}
                  className={isSettingsActive ? "text-background" : "text-blue-600"}
                />
                <span className={isCollapsed ? "md:hidden" : ""}>系统偏好设置</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* 4. 底部个人资料与快速退出 */}
        <div className="border-t border-border p-2 sm:p-3">
          <div
            className={`flex items-center justify-between gap-2 rounded-xl bg-muted/40 p-2 ${
              isCollapsed ? "md:flex-col md:p-1 md:gap-1.5" : ""
            }`}
          >
            <div
              className={`flex items-center gap-2.5 truncate ${
                isCollapsed ? "md:justify-center" : ""
              }`}
              title={`${displayName} (${displayEmail})`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className={`truncate text-left ${isCollapsed ? "md:hidden" : ""}`}>
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

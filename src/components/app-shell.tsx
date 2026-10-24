"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar, type ProjectSummary } from "./app-sidebar";
import { FeedbackProvider } from "./ui/feedback";
import { AppearanceProvider, useUiPreferences } from "./preferences";
import { CollaborationDock } from "./ai/floating";
import { isSidebarToggleShortcut, sidebarPreferenceStore } from "./sidebar-preference";
import { AccountBoundary } from "./account-boundary";
import { ACCOUNT_STORAGE_KEY, ACCOUNT_CHANGED_EVENT } from "./account-context";

type AppShellProps = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
  projects: ProjectSummary[];
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
};

export function AppShell({
  user,
  projects,
  onSignOut,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const workspacePage = pathname === "/ai" || pathname === "/settings" || /^\/(?:p|t)\/[^/]+\/resources$/.test(pathname);
  const { preferences } = useUiPreferences(user.id);
  const collapsed = useSyncExternalStore(
    sidebarPreferenceStore.subscribe,
    sidebarPreferenceStore.getSnapshot,
    () => false,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const editing = target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']") !== null);
      if (window.matchMedia("(min-width: 768px)").matches && isSidebarToggleShortcut(e, editing)) {
        e.preventDefault();
        sidebarPreferenceStore.toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <AccountBoundary key={user.id} userId={user.id}>
    <FeedbackProvider>
    <AppearanceProvider userId={user.id} />
    <div className="min-h-screen bg-background">
      {/* 统一全局可伸缩侧栏 */}
      <AppSidebar
        key={`sidebar:${user.id}`}
        user={user}
        projects={projects}
        onSignOut={async () => {
          try { localStorage.setItem(ACCOUNT_STORAGE_KEY, ""); } catch {}
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
          await onSignOut();
        }}
        isCollapsed={collapsed}
        onToggleCollapse={sidebarPreferenceStore.toggle}
      />

      {/* 主界面区域：随侧栏展开/收起平滑阻尼过渡 */}
      <div
        className={`app-panel flex flex-col ${workspacePage ? "min-h-[calc(100dvh-3.5rem)] md:min-h-dvh" : "min-h-screen"} transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? "md:pl-18" : "md:pl-60"
        }`}
      >
        <main className={workspacePage ? "w-full min-w-0 flex-1" : "min-w-0 flex-1 p-4 sm:p-6 w-full"}>
          {children}
        </main>
      </div>
      <CollaborationDock key={user.id} userId={user.id} projects={projects} aiEnabled={preferences.aiFloating && pathname !== "/ai"} showLauncher={pathname !== "/ai"} />
    </div>
    </FeedbackProvider>
    </AccountBoundary>
  );
}

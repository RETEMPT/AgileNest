"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AppSidebar, type ProjectSummary } from "./app-sidebar";
import { FeedbackProvider } from "./ui/feedback";

const preferenceKey = "agilenest_sidebar_collapsed";
const preferenceEvent = "agilenest:sidebar-preference";
let memoryPreference = false;

function readPreference() {
  try {
    const saved = localStorage.getItem(preferenceKey);
    return saved === null ? memoryPreference : saved === "true";
  } catch {
    return memoryPreference;
  }
}

function subscribePreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(preferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(preferenceEvent, onChange);
  };
}

function togglePreference() {
  memoryPreference = !readPreference();
  try {
    localStorage.setItem(preferenceKey, String(memoryPreference));
  } catch {}
  window.dispatchEvent(new Event(preferenceEvent));
}

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
  const collapsed = useSyncExternalStore(
    subscribePreference,
    readPreference,
    () => false,
  );

  // 支持通用快捷键 Ctrl+B 或 Cmd+B 一键展开/收起侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        togglePreference();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <FeedbackProvider>
    <div className="min-h-screen bg-background">
      {/* 统一全局可伸缩侧栏 */}
      <AppSidebar
        user={user}
        projects={projects}
        onSignOut={onSignOut}
        isCollapsed={collapsed}
        onToggleCollapse={togglePreference}
      />

      {/* 主界面区域：随侧栏展开/收起平滑阻尼过渡 */}
      <div
        className={`app-panel flex flex-col min-h-screen transition-[padding] duration-200 ease-out ${
          collapsed ? "md:pl-18" : "md:pl-64"
        }`}
      >
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
    </FeedbackProvider>
  );
}

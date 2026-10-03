"use client";

import { useState, useEffect } from "react";
import { AppSidebar, type ProjectSummary } from "./app-sidebar";

type AppShellProps = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  projects: ProjectSummary[];
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
};

export function AppShell({ user, projects, onSignOut, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  // 从本地缓存读取用户偏好
  useEffect(() => {
    try {
      const saved = localStorage.getItem("agilenest_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    } catch {
      // 忽略无法访问 localStorage 的情况
    }
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("agilenest_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // 支持通用快捷键 Ctrl+B 或 Cmd+B 一键展开/收起侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* 统一全局可伸缩侧栏 */}
      <AppSidebar
        user={user}
        projects={projects}
        onSignOut={onSignOut}
        isCollapsed={collapsed}
        onToggleCollapse={handleToggle}
      />

      {/* 主界面区域：随侧栏展开/收起平滑阻尼过渡 */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          collapsed ? "md:pl-18" : "md:pl-64"
        }`}
      >
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

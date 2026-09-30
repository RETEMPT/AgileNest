import { requireUser } from "@/modules/core/session";
import { listMyProjects } from "@/modules/identity";
import { signOut } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const rawProjects = await listMyProjects(user.id);

  // 格式化项目列表供侧栏切换与展示
  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    teamId: p.teamId,
    teamName: p.teamName,
    kind: p.kind,
  }));

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 统一全局协调侧边栏 */}
      <AppSidebar user={user} projects={projects} onSignOut={handleSignOut} />

      {/* 主界面区域：桌面端左留出 64 (16rem) 边距 */}
      <div className="flex flex-col md:pl-64 min-h-screen">
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

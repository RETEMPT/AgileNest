import { requireUser } from "@/modules/core/session";
import { listMyProjects, getAccountProfile } from "@/modules/identity";
import { signOut } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [rawProjects, profile] = await Promise.all([
    listMyProjects(user.id),
    getAccountProfile(user.id),
  ]);

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
    <AppShell user={profile} projects={projects} onSignOut={handleSignOut}>
      {children}
    </AppShell>
  );
}

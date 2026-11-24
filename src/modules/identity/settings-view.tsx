import { requireUser } from "@/modules/core";
import { getAcademicProfile, listMyProjects, listTeamSpaces } from "./service";
import { getAccountProfile } from "./profile-service";
import { AccountProfileForm } from "./profile-ui";
import { AcademicProfileForm } from "./academic-ui";
import { SettingsWorkspace } from "./settings-workspace";
import { redirect } from "next/navigation";
import { settingsSection } from "./settings-sections";
import { SettingsProjects } from "./settings-projects";
import { AiSettings, AppearanceSettings } from "./settings-preferences";
import { POSITION_META } from "./client";
import { NotificationPreferencesPanel } from "@/modules/notify/ui";

export async function SettingsView({ searchParams }: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  if (query.section === "guide") redirect("/guide");
  const [profile, academic, projects, teams] = await Promise.all([
    getAccountProfile(user.id), getAcademicProfile(user.id),
    listMyProjects(user.id), listTeamSpaces(user.id),
  ]);
  return <SettingsWorkspace profile={profile} joinedAt={profile.createdAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}
    initialSection={settingsSection(query.section)}
    panels={{
      profile: <AccountProfileForm profile={profile} />,
      academic: <AcademicProfileForm profile={academic} />,
      projects: <SettingsProjects projects={projects.map((project) => ({ ...project, positions: teams.find((team) => team.id === project.teamId)!.positions.map((position) => POSITION_META[position].label) }))} />,
      notifications: <div className="space-y-5"><div><h1 className="text-xl font-semibold">通知与关注</h1><p className="mt-2 text-sm text-muted-foreground">按个人偏好管理站内提醒。在项目、任务和资料详情中关注相关内容。</p></div><NotificationPreferencesPanel /></div>,
      ai: <AiSettings userId={user.id} />,
      appearance: <AppearanceSettings userId={user.id} />,
    }} />;
}

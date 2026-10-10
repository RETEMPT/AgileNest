import { requireUser } from "@/modules/core";
import { getAcademicProfile, listMyProjects, listTeamSpaces } from "./service";
import { getAccountProfile } from "./profile-service";
import { AccountProfileForm } from "./profile-ui";
import { AcademicProfileForm } from "./academic-ui";
import { getFeishuConnection } from "./connection-service";
import { FeishuConnectionPanel } from "./connection-ui";
import { SettingsWorkspace } from "./settings-workspace";
import { settingsSection } from "./settings-sections";
import { SettingsProjects } from "./settings-projects";
import { AiSettings, AppearanceSettings } from "./settings-preferences";
import { POSITION_META } from "./client";

export async function SettingsView({ searchParams }: {
  searchParams: Promise<{ section?: string; feishu?: string; notice?: string }>;
}) {
  const user = await requireUser();
  const [profile, academic, connection, projects, teams, query] = await Promise.all([
    getAccountProfile(user.id), getAcademicProfile(user.id), getFeishuConnection(user.id),
    listMyProjects(user.id), listTeamSpaces(user.id), searchParams,
  ]);
  return <SettingsWorkspace profile={profile} joinedAt={profile.createdAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}
    initialSection={query.feishu || query.notice ? "connections" : settingsSection(query.section)}
    panels={{
      profile: <AccountProfileForm profile={profile} feishuName={connection.name} />,
      academic: <AcademicProfileForm profile={academic} />,
      projects: <SettingsProjects projects={projects.map((project) => ({ ...project, positions: teams.find((team) => team.id === project.teamId)!.positions.map((position) => POSITION_META[position].label) }))} />,
      ai: <AiSettings userId={user.id} />,
      appearance: <AppearanceSettings userId={user.id} />,
      connections: <FeishuConnectionPanel connection={connection} notice={query.feishu ?? query.notice ?? null} />,
    }} />;
}

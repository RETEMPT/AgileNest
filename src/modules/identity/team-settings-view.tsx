import { notFound } from "next/navigation";
import { getTeamMembership, requireUser } from "@/modules/core";
import { listTeamMembers, listTeamProjects } from "./service";
import { getTeamInformation, listTeamAnnouncements } from "./team-service";
import { TeamSettingsWorkspace } from "./team-settings";

export async function TeamSettingsView({ teamId }: { teamId: string }) {
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const [information, announcements, members, projects] = await Promise.all([
    getTeamInformation(user.id, teamId), listTeamAnnouncements(user.id, teamId),
    listTeamMembers(user.id, teamId), listTeamProjects(user.id, teamId),
  ]);
  return <TeamSettingsWorkspace information={information} announcements={announcements} canManage={membership.positions.includes("admin")} memberCount={members.length} projectCount={projects.length} />;
}

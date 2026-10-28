import { notFound } from "next/navigation";
import { requireUser, getTeamMembership, getProjectForUser } from "@/modules/core";
import { listMyTeams } from "@/modules/identity";
import { listResources } from "./service";
import { ResourcesWorkspace } from "./ui";

export async function TeamResourcesView({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser(); const { teamId } = await params;
  if (!await getTeamMembership(user.id, teamId)) notFound();
  const team = (await listMyTeams(user.id)).find((item) => item.id === teamId);
  if (!team) notFound();
  return <ResourcesWorkspace actorId={user.id} teamId={teamId} scopeName={team.name} initialResources={await listResources(user.id, { teamId })} />;
}
export async function ProjectResourcesView({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser(); const { projectId } = await params; const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  return <ResourcesWorkspace actorId={user.id} teamId={access.project.teamId} projectId={projectId} scopeName={access.project.name} initialResources={await listResources(user.id, { projectId })} />;
}

export { ResourceFavoritesView } from "./favorites-views";

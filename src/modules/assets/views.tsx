import { notFound } from "next/navigation";
import { getTeamMembership, requireUser } from "@/modules/core";
import { listMyTeams } from "@/modules/identity";
import { AssetsWorkspace } from "./ui";

export async function TeamAssetsView({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  if (!(await getTeamMembership(user.id, teamId))) notFound();
  const team = (await listMyTeams(user.id)).find((item) => item.id === teamId);
  if (!team) notFound();
  return <AssetsWorkspace teamId={teamId} actorId={user.id} teamName={team.name} />;
}

import { TeamMembersView } from "@/modules/identity/views";

export default async function TeamMembersPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <TeamMembersView teamId={teamId} />;
}

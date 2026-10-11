import { TeamSettingsView } from "@/modules/identity/views";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamSettingsView teamId={teamId} />;
}

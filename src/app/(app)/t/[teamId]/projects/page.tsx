import { TeamProjectsView } from "@/modules/identity/views";

export default async function TeamProjectsPage({ params, searchParams }: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { teamId } = await params;
  const { kind } = await searchParams;
  return <TeamProjectsView teamId={teamId} kind={kind} />;
}

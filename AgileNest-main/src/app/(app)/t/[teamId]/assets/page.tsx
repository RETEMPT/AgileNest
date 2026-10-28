import { TeamAssetsView } from "@/modules/assets/views";

export default function AssetsPage({ params }: { params: Promise<{ teamId: string }> }) {
  return <TeamAssetsView params={params} />;
}

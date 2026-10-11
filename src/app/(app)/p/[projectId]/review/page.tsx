import { ReviewView } from "@/modules/review/views";

export default async function ReviewPage({ params }: {
  params: Promise<{ projectId: string }>;
}) {
  return <ReviewView params={params} />;
}

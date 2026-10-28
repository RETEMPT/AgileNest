import { ProjectCommentsView } from "@/modules/comments/views";

export default function CommentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <ProjectCommentsView params={params} />;
}

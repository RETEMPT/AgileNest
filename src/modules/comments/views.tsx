import { notFound } from "next/navigation";
import { getProjectForUser, requireUser } from "@/modules/core";
import { ProjectComments } from "./ui";

export async function ProjectCommentsView({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  return <ProjectComments projectId={projectId} actorId={user.id} projectName={access.project.name} />;
}

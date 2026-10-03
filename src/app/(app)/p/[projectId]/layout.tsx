import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { ProjectSidebar } from "./sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  return (
    <div className="space-y-6">
      <ProjectSidebar
        projectId={projectId}
        positions={access.positions}
        canReview={access.capabilities.review}
        name={access.project.name}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { ProjectContextHeader } from "@/modules/identity/ui";

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
      <ProjectContextHeader
        projectId={projectId}
        positions={access.positions}
        name={access.project.name}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

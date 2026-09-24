import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
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
    <div className="flex gap-6">
      <ProjectSidebar
        projectId={projectId}
        role={access.role}
        name={access.project.name}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

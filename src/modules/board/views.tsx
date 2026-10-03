import { notFound } from "next/navigation";
import { requireUser, getProjectForUser } from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import { listTeamMembers } from "@/modules/identity";
import { listMilestones } from "@/modules/milestone";
import { parseFilters, type GroupBy } from "./model";
import { ProjectWorkspace } from "./ui";

export async function ProjectWorkspaceView({
  projectId,
  query,
  view,
}: {
  projectId: string;
  query: Record<string, string | string[] | undefined>;
  view: "board" | "table";
}) {
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      params.append(key, item);
  }
  const [tasks, members, milestones] = await Promise.all([
    listProjectTasks(user.id, projectId, { parentTaskId: null }),
    listTeamMembers(user.id, access.project.teamId),
    listMilestones(user.id, projectId),
  ]);
  const group = params.get("groupBy");
  const groupBy: GroupBy =
    group === "assignee" || group === "priority" || group === "milestone"
      ? group
      : "status";
  return (
    <ProjectWorkspace
      projectId={projectId}
      projectName={access.project.name}
      tasks={tasks}
      role={access.role}
      actorId={user.id}
      members={members}
      milestones={milestones}
      filters={parseFilters(params)}
      groupBy={groupBy}
      view={view}
    />
  );
}

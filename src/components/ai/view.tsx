import { requireUser } from "@/modules/core";
import { listMyProjects } from "@/modules/identity";
import { AiWorkspace } from "./workspace";

export async function AiWorkspaceView() {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);
  return <AiWorkspace key={user.id} userId={user.id} projects={projects.map(({id,name,teamName}) => ({id,name,teamName}))} />;
}

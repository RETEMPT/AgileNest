import { AppError, requireUser } from "@/modules/core";
import { listMyProjects } from "@/modules/identity";
import { listMilestones } from "@/modules/milestone";
import { getTaskDetail, getTaskDelivery } from "@/modules/tasks";
import { planningRequestSchema, type AiPlanningContext } from "./planning-context";
import { AiWorkspace } from "./workspace";

export async function AiWorkspaceView({ searchParams }: { searchParams?: Promise<{ planning?: string; projectId?: string; milestoneId?: string; taskId?: string }> } = {}) {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);
  const query = await searchParams;
  const parsed = planningRequestSchema.safeParse(query);
  let planningContext: AiPlanningContext | undefined;
  const project = parsed.success ? projects.find((item) => item.id === parsed.data.projectId) : undefined;
  if (parsed.success && project) {
    if (parsed.data.planning === "task") {
      try {
        const task = await getTaskDetail(user.id, parsed.data.taskId);
        if (task.projectId === project.id) {
          const delivery = await getTaskDelivery(user.id, task.id);
          planningContext = { projectId: project.id, taskId: task.id, title: task.title, sourceText: [`来源任务：${task.title}`, `任务背景：${task.description ?? "未填写"}`, "验收要求：", ...delivery.requirements.criteria.map((item) => `- ${item.text}`), "请基于以上现有任务完善需求与工作安排。此处生成的新任务须预览确认，不自动修改来源任务。"].join("\n") };
        }
      } catch (error) { if (!(error instanceof AppError && [403, 404].includes(error.status))) throw error; }
    } else if (parsed.data.milestoneId) {
      const milestoneId = parsed.data.milestoneId;
      const milestone = (await listMilestones(user.id, project.id)).find((item) => item.id === milestoneId);
      if (milestone) planningContext = { projectId: project.id, milestoneId: milestone.id, title: milestone.title };
    } else planningContext = { projectId: project.id, title: project.name };
  }
  return <AiWorkspace key={user.id} userId={user.id} projects={projects.map(({id,name,teamName}) => ({id,name,teamName}))} planningContext={planningContext} planningError={!!query?.planning && !planningContext} />;
}

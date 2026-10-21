import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import { listMilestones } from "@/modules/milestone";
import { createTask, getTaskDetail, getTaskDelivery, getTaskOrganization, changeTaskOrganization, type AcceptanceCriterion, type TaskDTO, type TaskOrganizationDTO } from "@/modules/tasks";
import { readyTaskPlanSchema, type TaskPlanNode } from "./client";
import { requireBuiltinPlugin } from "./plugins";

export const MAX_APPLY_PLAN_NODES = 20;
export const applyTaskPlanInputSchema = z.object({
  projectId: z.uuid("请选择项目"), milestoneId: z.uuid("里程碑无效").optional(), runId: z.uuid("创建请求无效"),
  plan: readyTaskPlanSchema.superRefine((plan, ctx) => {
    if (plan.nodes.length > MAX_APPLY_PLAN_NODES) ctx.addIssue({ code: "custom", message: "每次最多创建 20 个任务，请拆成多次规划" });
    if (plan.nodes.some((node) => !node.criteria.length)) ctx.addIssue({ code: "custom", message: "每个任务至少需要一项验收要求，请补齐后创建" });
  }),
}).strict();
export type ApplyTaskPlanInput = z.infer<typeof applyTaskPlanInputSchema>;
export type ApplyTaskPlanResult = { tasks: { nodeId: string; taskId: string; title: string }[]; complete: boolean; error?: string };

function stableId(parts: string[]) {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function sameCriteria(left: AcceptanceCriterion[], right: AcceptanceCriterion[]) {
  return left.length === right.length && left.every((criterion, index) => criterion.id === right[index].id && criterion.text === right[index].text);
}

export async function applyTaskPlan(actorId: string, input: unknown): Promise<ApplyTaskPlanResult> {
  await requireBuiltinPlugin(actorId, "task-planner");
  const parsed = applyTaskPlanInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const { projectId, milestoneId, runId } = parsed.data;
  const access = await requireProjectForUser(actorId, projectId);
  if (!access.capabilities.task.actions.includes("create")) throw new ForbiddenError("你没有创建任务的权限");
  const plan = { version: 1 as const, nodes: parsed.data.plan.nodes.map((node) => ({ ...node, title: node.title.trim(), criteria: node.criteria.map((text) => text.trim()) })) };
  if (milestoneId && !(await listMilestones(actorId, projectId)).some((milestone) => milestone.id === milestoneId)) throw new AppError("请选择当前项目的里程碑");
  if (plan.nodes.some((node) => node.dependsOn.length) && !access.capabilities.task.actions.includes("assign")) throw new ForbiddenError("含有任务先后顺序的规划需由有任务安排权限的成员创建；也可先移除先后顺序");
  const ordered = [...plan.nodes.filter((node) => !node.parentId), ...plan.nodes.filter((node) => node.parentId)];
  const anchor = ordered[0];
  const fingerprint = createHash("sha256").update(JSON.stringify({ milestoneId: milestoneId ?? null, plan })).digest("hex");
  const key = [actorId, projectId, runId];
  // A stable first task binds the whole confirmed batch across process restarts, without visible metadata.
  const ids = new Map(ordered.map((node) => [node.id, stableId([...key, node.id === anchor.id ? "anchor" : `node:${node.id}`])]));
  const criteriaFor = (node: TaskPlanNode) => node.criteria.map((text, index) => ({ id: stableId([...key, node.id, `criterion:${index}`, ...(node.id === anchor.id && index === 0 ? [fingerprint] : [])]), text }));
  const result: ApplyTaskPlanResult = { tasks: [], complete: false };
  const existing = new Map<string, TaskDTO>();
  const conflict = () => new ConflictError("这次创建请求的规划或已创建任务已变化，不能继续覆盖。请查看已创建任务；如需另一份规划，请重新开始创建");
  async function assertTask(node: TaskPlanNode, task: TaskDTO) {
    if (task.projectId !== projectId || task.createdById !== actorId || task.title !== node.title || task.milestoneId !== (milestoneId ?? null) || task.parentTaskId !== (node.parentId ? ids.get(node.parentId) : null) || task.status !== "unclaimed" || task.assigneeId !== null || task.description !== null || task.startDate !== null || task.dueDate !== null || task.estimatedMinutes !== null || task.sortOrder !== 0 || task.priority !== "medium" || task.completionNote !== null || task.rejectReason !== null) throw conflict();
    const delivery = await getTaskDelivery(actorId, task.id);
    if (!sameCriteria(delivery.requirements.criteria, criteriaFor(node)) || delivery.submissions.length) throw conflict();
  }
  function assertOrganization(node: TaskPlanNode, organization: TaskOrganizationDTO) {
    const incoming = new Set(node.dependsOn.map((id) => ids.get(id)));
    const outgoing = new Set(plan.nodes.filter((item) => item.dependsOn.includes(node.id)).map((item) => ids.get(item.id)));
    if (organization.labels.length || organization.blockedBy.some((edge) => !incoming.has(edge.task.id)) || organization.blocking.some((edge) => !outgoing.has(edge.task.id))) throw conflict();
  }
  // Validate every already-created item before creating or changing anything in a retry.
  for (const node of ordered) {
    let task: TaskDTO;
    try { task = await getTaskDetail(actorId, ids.get(node.id)!); }
    catch (error) { if (error instanceof NotFoundError) continue; throw error; }
    await assertTask(node, task);
    assertOrganization(node, await getTaskOrganization(actorId, task.id));
    existing.set(node.id, task);
  }
  if (existing.size && !existing.has(anchor.id)) throw conflict();
  try {
    for (const node of ordered) {
      const task = existing.get(node.id) ?? await createTask(actorId, projectId, {
        title: node.title, ...(milestoneId ? { milestoneId } : {}), ...(node.parentId ? { parentTaskId: ids.get(node.parentId)! } : {}),
        acceptanceCriteria: criteriaFor(node), requestKey: ids.get(node.id)!,
      });
      result.tasks.push({ nodeId: node.id, taskId: task.id, title: task.title });
      await assertTask(node, task);
    }
    for (const node of ordered) {
      const taskId = ids.get(node.id)!;
      let organization = await getTaskOrganization(actorId, taskId);
      assertOrganization(node, organization);
      for (const beforeId of node.dependsOn) {
        const otherTaskId = ids.get(beforeId)!;
        if (organization.blockedBy.some((edge) => edge.task.id === otherTaskId)) continue;
        organization = await changeTaskOrganization(actorId, taskId, { op: "addDependency", direction: "blockedBy", otherTaskId, version: organization.version });
      }
    }
    result.complete = true;
  } catch (error) {
    // Each public task operation is transactional; completed operations remain available for a retry.
    result.error = error instanceof AppError ? error.message : "创建中断，已创建的任务保留，请重试未完成项";
  }
  return result;
}

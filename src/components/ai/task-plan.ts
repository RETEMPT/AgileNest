import { z } from "zod";
import { readyTaskPlanSchema, taskPlanSchema, type TaskPlan, type TaskPlanNode } from "@/modules/ai/client";
export { MAX_PLAN_NODES, taskPlanSchema, type TaskPlan, type TaskPlanNode } from "@/modules/ai/client";
export type TaskPlanContext = { milestoneId?: string; taskId?: string; sourceId?: string; title: string };
export const emptyTaskPlan = (): TaskPlan => ({ version: 1, nodes: [] });
export const taskPlanApplyResultSchema = z.object({ tasks: z.array(z.object({ nodeId: z.string(), taskId: z.uuid(), title: z.string() })), complete: z.boolean(), error: z.string().optional() });
export const taskPlanPublicationSchema = z.object({ runId: z.uuid(), plan: readyTaskPlanSchema, result: taskPlanApplyResultSchema.optional() }).strict();
export type TaskPlanPublication = z.infer<typeof taskPlanPublicationSchema>;
export function prepareTaskPlanPublication(plan: TaskPlan, runId: string): TaskPlanPublication {
  const valid = readyTaskPlanSchema.parse(plan);
  if (valid.nodes.length > 20) throw new Error("每次最多创建 20 个任务，请拆成多次规划");
  if (valid.nodes.some((node) => !node.criteria.length)) throw new Error("每个任务至少需要一项验收要求，请补齐后创建");
  return taskPlanPublicationSchema.parse({ runId, plan: valid });
}

export function taskPlanStorageKey(userId: string, projectId: string | null, context?: TaskPlanContext) {
  return `agilenest:ai-task-plan:v1:${encodeURIComponent(JSON.stringify(context?.taskId ? [userId, projectId, null, "task", context.taskId] : context?.sourceId ? [userId, projectId, null, "source", context.sourceId] : [userId, projectId, context?.milestoneId ?? null]))}`;
}
export function decodeTaskPlan(raw: string | null): TaskPlan {
  return raw === null ? emptyTaskPlan() : taskPlanSchema.parse(JSON.parse(raw));
}
export function importTaskPlan(text: string): TaskPlan {
  if (text.length > 700000) throw new Error("规划 JSON 过大，请限制为 40 个任务");
  const plan = decodeTaskPlan(text);
  assertPlanReady(plan);
  return plan;
}
function assertPlanReady(plan: TaskPlan) {
  readyTaskPlanSchema.parse(plan);
}
export function updatePlanNode(plan: TaskPlan, node: TaskPlanNode): TaskPlan {
  if (!plan.nodes.some((item) => item.id === node.id)) throw new Error("任务不存在，请重新选择");
  return taskPlanSchema.parse({ ...plan, nodes: plan.nodes.map((item) => item.id === node.id ? node : item) });
}
export function removePlanLeaf(plan: TaskPlan, id: string): TaskPlan {
  if (!plan.nodes.some((node) => node.id === id)) throw new Error("任务不存在");
  if (plan.nodes.some((node) => node.parentId === id)) throw new Error("请先移动或删除子任务，再删除主任务");
  if (plan.nodes.some((node) => node.dependsOn.includes(id))) throw new Error("其他任务还需要先完成此任务，请先调整任务先后");
  return taskPlanSchema.parse({ ...plan, nodes: plan.nodes.filter((node) => node.id !== id) });
}
export function encodeTaskPlan(plan: TaskPlan, format: "json" | "text", context?: TaskPlanContext) {
  const valid = taskPlanSchema.parse(plan); assertPlanReady(valid);
  if (format === "json") return JSON.stringify(valid, null, 2);
  const names = new Map(valid.nodes.map((node) => [node.id, node.title]));
  const ordered = valid.nodes.filter((node) => !node.parentId).flatMap((node) => [node, ...valid.nodes.filter((child) => child.parentId === node.id)]);
  return [`# 任务规划${context ? ` · ${context.title}` : ""}`, "待确认的任务规划。创建项目任务后可在项目中执行与验收。", ...ordered.flatMap((node) => [`\n${node.parentId ? "###" : "##"} ${node.title}`, `需先完成：${node.dependsOn.map((id) => names.get(id)).join("、") || "无"}`, ...node.criteria.map((criterion) => `- [ ] ${criterion}`), ...(node.criteria.length ? [] : ["验收要求：待补充"])])].join("\n");
}
export function taskPlanOutline(plan: TaskPlan, context?: TaskPlanContext) {
  return [
    `请协助规划任务${context ? `，来源${context.taskId ? "任务" : context.sourceId ? "对话" : "里程碑"}：${context.title}` : ""}。生成结果需我确认后才创建真实任务。`,
    "请依据我提供的真实资料拆分主任务和一层子任务，并逐项提出可核验的验收要求。父子层级表示工作分解，任务先后表示执行顺序，两者分别描述。资料不足、负责人、期限或要求不明确时列出待确认事实，不编造事实。",
    '确认事实后仅输出 JSON，严格使用结构：{"version":1,"nodes":[{"id":"唯一英文数字下划线或短横线标识","title":"任务名称","criteria":["逐项验收要求"],"parentId":null,"dependsOn":[]}]}。',
    "约束：最多40节点；id最长80字符且唯一；标题1–200字；criteria最多30项，每项1–500字且不重复；主任务parentId为null，子任务引用主任务id；dependsOn仅引用同批节点id，不重复、不指向自身、不形成环。不要生成额外字段、执行指令、真实任务创建结果或模拟进度。",
    ...(plan.nodes.length ? ["以下是我当前手工编辑的规划草稿，请保留明确要求，发现疑问先向我确认：", JSON.stringify(taskPlanSchema.parse(plan), null, 2)] : ["待补充：任务目标、已有资料、交付范围与验收约束。"]),
  ].join("\n\n");
}
export function writeTaskPlan(storage: Pick<Storage, "getItem" | "setItem">, key: string, baseline: string | null, plan: TaskPlan): string {
  if (storage.getItem(key) !== baseline) throw new Error("另一窗口已修改此规划。当前输入保留，请先导出备份，避免覆盖");
  const raw = JSON.stringify(taskPlanSchema.parse(plan)); storage.setItem(key, raw); return raw;
}

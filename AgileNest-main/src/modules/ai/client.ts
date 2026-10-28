import { z } from "zod";
export * from "./plugins-client";
export * from "./output-client";
import { chatOutputUiSchema } from "./output-client";
import { wouldCreateTaskDependencyCycle } from "@/modules/tasks/client";

export const modelConfigurationSchema = z.object({
  name: z.string().trim().min(1, "请输入配置名称").max(60, "配置名称最多 60 字"),
  provider: z.enum(["deepseek", "openai", "anthropic", "compatible"]),
  baseUrl: z.string().trim().min(1, "请输入 API 地址").max(500, "API 地址过长"),
  model: z.string().trim().min(1, "请输入模型名称").max(120, "模型名称过长").regex(/^[^\s\u0000-\u001f\u007f]+$/, "模型名称不能包含空格或控制字符"),
  protocol: z.enum(["chat", "responses", "anthropic"]),
  timeoutSeconds: z.number().int().min(10, "超时至少 10 秒").max(180, "超时最多 180 秒"),
  maxOutputTokens: z.number().int().min(128, "最大输出至少 128 tokens").max(8192, "最大输出最多 8192 tokens"),
  reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
}).strict();
export const modelConfigurationInputSchema = modelConfigurationSchema.extend({
  apiKey: z.string().trim().max(1024, "密钥过长").regex(/^[^\u0000-\u001f\u007f]*$/, "密钥不能包含换行或控制字符").optional(),
});
export type ModelConfiguration = z.infer<typeof modelConfigurationSchema>;
export type ModelConfigurationInput = z.infer<typeof modelConfigurationInputSchema>;
export type ModelConfigurationStatus = { configured: boolean; configuration?: ModelConfiguration };
export const modelProviderListSchema = z.object({
  revision: z.number().int().nonnegative(), activeId: z.uuid().nullable(),
  providers: z.array(z.object({ id: z.uuid(), configuration: modelConfigurationSchema, updatedAt: z.string() }).strict()).max(12),
}).strict();
export const modelProviderSaveSchema = z.object({ expectedRevision: z.number().int().nonnegative(), id: z.uuid().optional(), configuration: modelConfigurationInputSchema }).strict();
export const modelProviderActionSchema = z.object({ expectedRevision: z.number().int().nonnegative(), op: z.enum(["activate", "delete"]), id: z.uuid() }).strict();
export type ModelProviderList = z.infer<typeof modelProviderListSchema>;

export const MAX_PLAN_NODES = 40;
const nodeId = z.string().min(1, "任务标识不能为空").max(80, "任务标识最多 80 字符").regex(/^[a-zA-Z0-9_-]+$/, "任务标识只能包含英文字母、数字、下划线和短横线");
const taskPlanNodeSchema = z.object({
  id: nodeId, title: z.string().max(200, "任务名称最多 200 字"),
  criteria: z.array(z.string().max(500, "单条验收要求最多 500 字")).max(30, "每项任务最多 30 条验收要求"),
  parentId: nodeId.nullable(), dependsOn: z.array(nodeId).max(MAX_PLAN_NODES - 1, "最多选择 39 项需要先完成的任务"),
}).strict();
export const taskPlanSchema = z.object({ version: z.literal(1), nodes: z.array(taskPlanNodeSchema).max(MAX_PLAN_NODES, "最多规划 40 个任务") }).strict().superRefine((plan, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = new Set(plan.nodes.map((node) => node.id));
  if (ids.size !== plan.nodes.length) { fail("任务标识重复"); return; }
  const edges: { blockerTaskId: string; blockedTaskId: string }[] = plan.nodes.filter((node) => node.parentId && ids.has(node.parentId)).map((node) => ({ blockerTaskId: node.id, blockedTaskId: node.parentId! }));
  for (const node of plan.nodes) {
    if (node.parentId) {
      const parent = plan.nodes.find((item) => item.id === node.parentId);
      if (!parent) fail("父任务不存在");
      else if (parent.id === node.id || parent.parentId !== null) fail("仅支持主任务和一层子任务，不能移入自身或子任务");
    }
    if (new Set(node.dependsOn).size !== node.dependsOn.length) fail("需要先完成的任务重复");
    for (const before of node.dependsOn) {
      if (!ids.has(before)) fail("需要先完成的任务不存在");
      else if (wouldCreateTaskDependencyCycle(edges, before, node.id)) fail("先后顺序不能指向自身或首尾相连");
      else edges.push({ blockerTaskId: before, blockedTaskId: node.id });
    }
  }
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;
export type TaskPlanNode = TaskPlan["nodes"][number];
export const readyTaskPlanSchema = taskPlanSchema.superRefine((plan, ctx) => {
  if (!plan.nodes.length) ctx.addIssue({ code: "custom", message: "请先添加任务" });
  for (const node of plan.nodes) {
    if (!node.title.trim()) ctx.addIssue({ code: "custom", message: "每个任务都需要名称" });
    if (node.criteria.some((criterion) => !criterion.trim()) || new Set(node.criteria.map((criterion) => criterion.trim())).size !== node.criteria.length) ctx.addIssue({ code: "custom", message: "验收要求不能留空或重复" });
  }
});
export const chatRequestSchema = z.object({
  projectId: z.uuid("项目无效").nullable().optional(),
  knowledgeScope: z.enum(["project", "accessible", "none"]).default("project"),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1, "消息不能为空").max(30000, "单条消息过长") }).strict()).min(1, "请填写消息").max(21, "对话过长，请新建对话"),
}).strict().refine((input) => input.messages.at(-1)?.role === "user", "最后一条消息需为本人输入").refine((input) => input.messages.reduce((sum, message) => sum + message.content.length, 0) <= 120000, "对话内容过长，请减少资料或新建对话");
export const planRequestSchema = z.object({ projectId: z.uuid("请选择项目"), milestoneId: z.uuid("里程碑无效").optional(), goal: z.string().trim().min(1, "请输入规划目标").max(30000, "规划目标最多 30000 字"), plan: taskPlanSchema.optional() }).strict();
export type ChatRequest = z.input<typeof chatRequestSchema>;
export const chatSourceSchema = z.object({ resourceId: z.uuid(), title: z.string().max(160), version: z.number().int().positive(), href: z.string().max(500), excerpt: z.string().max(300), location: z.string().max(200).optional() }).strict();
export const chatRetrievalSchema = z.object({ scope: z.enum(["project", "accessible", "none"]), searchedScopes: z.number().int().nonnegative(), matchedResources: z.number().int().nonnegative(), readResources: z.number().int().nonnegative(), truncated: z.boolean() }).strict();
export const chatWorkSourceSchema = z.object({ kind: z.enum(["task", "milestone"]), id: z.uuid(), title: z.string().max(200), href: z.string().max(500), excerpt: z.string().max(500) }).strict();
export const chatToolSourceSchema = z.object({ serverId: z.uuid(), serverName: z.string().max(60), toolName: z.string().max(128), excerpt: z.string().max(300), truncated: z.boolean() }).strict();
export const chatResultSchema = z.object({ text: z.string().min(1).max(24000), model: z.string().min(1).max(120), sources: z.array(chatSourceSchema).max(12), workSources: z.array(chatWorkSourceSchema).max(10).default([]), toolSources: z.array(chatToolSourceSchema).max(2).default([]), retrieval: chatRetrievalSchema, ui: chatOutputUiSchema.optional() }).strict();
export const chatProgressSchema = z.object({ type: z.literal("progress"), phase: z.enum(["searching", "reading", "answering"]), message: z.string() }).strict();
export const chatStreamEventSchema = z.discriminatedUnion("type", [chatProgressSchema, chatResultSchema.extend({ type: z.literal("result") }), z.object({ type: z.literal("error"), error: z.string() }).strict()]);
export type ChatSource = z.infer<typeof chatSourceSchema>;
export type ChatResult = z.infer<typeof chatResultSchema>;
export type ChatProgress = z.infer<typeof chatProgressSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const planAssistRequestSchema = planRequestSchema.extend({ mode: z.enum(["clarify", "review"]) }).refine((input) => input.mode !== "review" || !!input.plan?.nodes.length, "请先生成或填写任务规划，再检查验收要求");
export const clarificationSchema = z.object({ mode: z.literal("clarify"), questions: z.array(z.object({ question: z.string().trim().min(1).max(300), reason: z.string().trim().min(1).max(500) }).strict()).max(4) }).strict();
export const criteriaReviewSchema = z.object({ mode: z.literal("review"), suggestions: z.array(z.object({ nodeId, criterionIndex: z.number().int().min(0).max(29), evidence: z.string().max(500), reason: z.string().trim().min(1).max(500), replacement: z.string().trim().min(1).max(500).nullable() }).strict()).max(12) }).strict();
export const planAssistResultSchema = z.discriminatedUnion("mode", [clarificationSchema, criteriaReviewSchema]);
export type PlanAssistRequest = z.infer<typeof planAssistRequestSchema>;
export type PlanAssistResult = z.infer<typeof planAssistResultSchema>;

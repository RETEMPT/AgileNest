import { z } from "zod";
import { TASK_STATUSES } from "@/modules/tasks/client";

export const taskAssistanceRequestSchema = z.object({
  taskId: z.uuid("请选择任务"),
  expectedUpdatedAt: z.iso.datetime("任务版本无效，请刷新后重试"),
  brief: z.string().trim().max(4000, "补充说明最多 4000 字").default(""),
}).strict();
export const taskAssistanceSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  rationale: z.string().trim().min(1).max(1600),
  extensions: z.array(z.object({ title: z.string().trim().min(1).max(160), reason: z.string().trim().min(1).max(800), addition: z.string().trim().min(1).max(2000) }).strict()).max(4),
  questions: z.array(z.string().trim().min(1).max(500)).max(4),
  roadmap: z.array(z.object({ title: z.string().trim().min(1).max(160), outcome: z.string().trim().min(1).max(1000), orderNote: z.string().trim().min(1).max(600) }).strict()).min(1).max(6),
}).strict();
export const taskAssistanceResultSchema = z.object({
  task: z.object({ id: z.uuid(), projectId: z.uuid(), title: z.string(), description: z.string().nullable(), status: z.enum(TASK_STATUSES), updatedAt: z.iso.datetime() }).strict(),
  requirements: z.object({ version: z.number().int().nonnegative(), criteria: z.array(z.object({ id: z.string().min(1), text: z.string() }).strict()).max(30) }).strict(),
  suggestion: taskAssistanceSuggestionSchema,
  model: z.string(),
}).strict();
export const applyTaskAssistanceSchema = z.object({
  taskId: z.uuid("请选择任务"),
  expectedUpdatedAt: z.iso.datetime("任务版本无效，请刷新后重试"),
  title: z.string().trim().min(1, "任务标题不能为空").max(200, "任务标题最多 200 字").optional(),
  description: z.string().trim().max(10000, "工作背景最多 10000 字").optional(),
  confirmed: z.literal(true, "请明确确认应用选中的修改"),
}).strict().refine((value) => value.title !== undefined || value.description !== undefined, "请先选择要应用的修改");

export type TaskAssistanceRequest = z.infer<typeof taskAssistanceRequestSchema>;
export type TaskAssistanceSuggestion = z.infer<typeof taskAssistanceSuggestionSchema>;
export type TaskAssistanceResult = z.infer<typeof taskAssistanceResultSchema>;
export type ApplyTaskAssistanceInput = z.infer<typeof applyTaskAssistanceSchema>;
export type TaskAssistanceSelection = { title: boolean; description: boolean; extensions: number[] };

export function selectedTaskAssistancePatch(result: TaskAssistanceResult, selection: TaskAssistanceSelection): { title?: string; description?: string } {
  const patch: { title?: string; description?: string } = {};
  if (selection.title && result.suggestion.title !== result.task.title) patch.title = result.suggestion.title;
  if (new Set(selection.extensions).size !== selection.extensions.length || selection.extensions.some((index) => !Number.isInteger(index) || !result.suggestion.extensions[index])) throw new Error("扩展建议已变化，请重新选择");
  let description = selection.description ? result.suggestion.description : result.task.description ?? "";
  if (selection.extensions.length) description += `\n\n补充需求（本人选择采纳）：\n${selection.extensions.map((index) => { const item = result.suggestion.extensions[index]; return `\n${item.title}\n${item.addition}`; }).join("\n")}`;
  if (description.length > 10000) throw new Error("选中的工作背景与扩展超过 10000 字，请减少选项");
  if ((selection.description || selection.extensions.length) && description !== (result.task.description ?? "")) patch.description = description;
  return patch;
}

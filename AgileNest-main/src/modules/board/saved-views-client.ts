import { z } from "zod";
import { TASK_STATUSES } from "@/modules/tasks/client";
import { parseFilters, serializeFilters, workspaceUrl } from "./model";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const savedTaskViewLayoutSchema = z.enum(["tasks", "board", "table"]);
export const savedTaskViewGroupSchema = z.enum(["status", "assignee", "priority", "milestone"]);
export const savedTaskViewNameSchema = z.string().trim().min(1, "请填写视图名称").max(80, "视图名称最多 80 个字").refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "视图名称不能包含换行或控制字符");
export const savedTaskViewFiltersSchema = z.object({
  status: z.array(z.enum(TASK_STATUSES)).max(TASK_STATUSES.length).optional(),
  priority: z.array(z.enum(["high", "medium", "low"])).max(3).optional(),
  assigneeId: uuid.optional(),
  milestoneId: uuid.optional(),
  labelId: uuid.optional(),
  blocked: z.boolean().optional(),
  q: z.string().trim().max(200, "保存视图的搜索词最多 200 个字").optional(),
}).strict().transform((filters) => parseFilters(serializeFilters({
  ...filters,
  ...(filters.status && { status: [...new Set(filters.status)] }),
  ...(filters.priority && { priority: [...new Set(filters.priority)] }),
})));

export const savedTaskViewInputSchema = z.object({
  name: savedTaskViewNameSchema,
  layout: savedTaskViewLayoutSchema,
  groupBy: savedTaskViewGroupSchema,
  filters: savedTaskViewFiltersSchema,
}).strict();
export const savedTaskViewUpdateSchema = savedTaskViewInputSchema.extend({ version: z.number().int().positive() }).strict();
export const savedTaskViewDeleteSchema = z.object({ version: z.number().int().positive() }).strict();
export const savedTaskViewSchema = savedTaskViewInputSchema.extend({
  id: uuid,
  projectId: uuid,
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export const savedTaskViewListSchema = z.array(savedTaskViewSchema);
export type SavedTaskViewLayout = z.infer<typeof savedTaskViewLayoutSchema>;
export type SavedTaskViewInput = z.infer<typeof savedTaskViewInputSchema>;
export type SavedTaskViewUpdate = z.infer<typeof savedTaskViewUpdateSchema>;
export type SavedTaskViewDTO = z.infer<typeof savedTaskViewSchema>;

export function savedTaskViewUrl(view: Pick<SavedTaskViewDTO, "projectId" | "layout" | "groupBy" | "filters">): string {
  return workspaceUrl({ projectId: view.projectId, view: view.layout, groupBy: view.groupBy, filters: view.filters });
}

export function savedTaskViewSummary(view: Pick<SavedTaskViewInput, "layout" | "groupBy" | "filters">): string {
  const layout = { tasks: "任务池", board: "看板", table: "表格" }[view.layout];
  const group = { status: "状态", assignee: "负责人", priority: "优先级", milestone: "里程碑" }[view.groupBy];
  const count = Object.values(view.filters).filter((value) => value !== undefined && (!Array.isArray(value) || value.length > 0)).length;
  return `${layout} · 按${group}分组 · ${count ? `${count} 项筛选` : "全部任务"}`;
}

import { z } from "zod";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUSES } from "./states";

export const TASK_LABEL_COLORS = ["brand", "slate", "cyan", "green", "amber", "red", "violet"] as const;
export type TaskLabelColor = (typeof TASK_LABEL_COLORS)[number];
export const TASK_LABEL_STYLES: Record<TaskLabelColor, { name: string; className: string }> = {
  brand: { name: "品牌蓝", className: "border-brand/25 bg-brand-soft text-brand" },
  slate: { name: "灰色", className: "border-slate-400/25 bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  cyan: { name: "青色", className: "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  green: { name: "绿色", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  amber: { name: "橙色", className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  red: { name: "红色", className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  violet: { name: "紫色", className: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
};

export type TaskLabelDTO = { id: string; projectId: string; name: string; color: TaskLabelColor; version: number };
export type TaskRelationTask = { id: string; title: string; status: TaskStatus; assigneeName: string | null; canBlock: boolean };
export type TaskDependencyDTO = { id: string; task: TaskRelationTask; canRemove: boolean };
export type TaskOrganizationDTO = {
  taskId: string; projectId: string; version: number; canEdit: boolean; canManageLabels: boolean;
  labels: TaskLabelDTO[]; projectLabels: TaskLabelDTO[];
  blockedBy: TaskDependencyDTO[]; blocking: TaskDependencyDTO[];
  blocked: boolean; reopenBlocked: boolean;
  candidates: TaskRelationTask[]; candidatesTruncated: boolean; query: string;
};
export type TaskOrganizationSummary = { labels: TaskLabelDTO[]; blockedByIds: string[]; blockingIds: string[]; blocked: boolean; reopenBlocked: boolean };

export const taskLabelCreateSchema = z.object({
  name: z.string().trim().min(1, "请输入标签名称").max(40, "标签名称最多 40 字"),
  color: z.enum(TASK_LABEL_COLORS).default("brand"),
}).strict();
export const taskLabelPatchSchema = taskLabelCreateSchema.extend({ version: z.number().int().positive("标签版本无效") });
export const taskOrganizationMutationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("labels"), version: z.number().int().positive(), labelIds: z.array(z.uuid("请选择当前项目的标签")).max(20, "一个任务最多选择 20 个标签").refine((ids) => new Set(ids).size === ids.length, "标签不能重复") }).strict(),
  z.object({ op: z.literal("addDependency"), version: z.number().int().positive(), otherTaskId: z.uuid("请选择当前项目的任务"), direction: z.enum(["blockedBy", "blocking"]) }).strict(),
  z.object({ op: z.literal("removeDependency"), version: z.number().int().positive(), dependencyId: z.uuid("依赖关系无效") }).strict(),
]);
export type TaskOrganizationMutation = z.infer<typeof taskOrganizationMutationSchema>;
export const taskActionItemCreateSchema = z.object({
  resourceId: z.uuid("来源文档无效"), sourceVersion: z.number().int().positive("来源版本无效"), requestKey: z.uuid("行动项请求无效"),
  quote: z.string().trim().max(2000, "来源摘录最多 2000 字").optional(),
  title: z.string().trim().min(1, "请输入行动项标题").max(200, "标题最多 200 字"),
  description: z.string().trim().max(10000, "说明最多 10000 字").optional(), dueDate: z.iso.date("截止日期需为有效的 YYYY-MM-DD").optional(),
}).strict();
export type TaskActionItemInput = z.infer<typeof taskActionItemCreateSchema>;
export type TaskActionItemOrigin = { resourceId: string; resourceTitle: string | null; sourceVersion: number; quote: string | null; accessible: boolean };

export const taskLabelDTOSchema = z.object({ id: z.uuid(), projectId: z.uuid(), name: z.string(), color: z.enum(TASK_LABEL_COLORS), version: z.number().int().positive() });
const relationTaskSchema = z.object({ id: z.uuid(), title: z.string(), status: z.enum(TASK_STATUSES), assigneeName: z.string().nullable(), canBlock: z.boolean() });
const dependencySchema = z.object({ id: z.uuid(), task: relationTaskSchema, canRemove: z.boolean() });
export const taskOrganizationDTOSchema = z.object({
  taskId: z.uuid(), projectId: z.uuid(), version: z.number().int().positive(), canEdit: z.boolean(), canManageLabels: z.boolean(),
  labels: z.array(taskLabelDTOSchema), projectLabels: z.array(taskLabelDTOSchema),
  blockedBy: z.array(dependencySchema), blocking: z.array(dependencySchema), blocked: z.boolean(), reopenBlocked: z.boolean(),
  candidates: z.array(relationTaskSchema), candidatesTruncated: z.boolean(), query: z.string(),
});

export function wouldCreateTaskDependencyCycle(edges: readonly { blockerTaskId: string; blockedTaskId: string }[], blockerTaskId: string, blockedTaskId: string): boolean {
  if (blockerTaskId === blockedTaskId) return true;
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.blockerTaskId, [...(next.get(edge.blockerTaskId) ?? []), edge.blockedTaskId]);
  const pending = [blockedTaskId];
  const visited = new Set<string>();
  while (pending.length) {
    const taskId = pending.pop()!;
    if (taskId === blockerTaskId) return true;
    if (visited.has(taskId)) continue;
    visited.add(taskId);
    pending.push(...(next.get(taskId) ?? []));
  }
  return false;
}

export function matchesTaskOrganization(task: Partial<TaskOrganizationSummary>, filters: { labelId?: string; blocked?: boolean }): boolean {
  if (filters.labelId && !task.labels?.some((label) => label.id === filters.labelId)) return false;
  if (filters.blocked !== undefined && Boolean(task.blocked) !== filters.blocked) return false;
  return true;
}

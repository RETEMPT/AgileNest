import { z } from "zod";
import { AppError, isValidISODate } from "@/modules/core";

const date = z.iso
  .date({ error: "日期需为有效的 YYYY-MM-DD" })
  .refine(isValidISODate)
  .nullable()
  .optional();
export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题最多 200 字"),
  description: z
    .string()
    .trim()
    .max(10000, "描述最多 10000 字")
    .nullable()
    .optional(),
  milestoneId: z.uuid("里程碑无效").nullable().optional(),
  parentTaskId: z.uuid("父任务无效").nullable().optional(),
  startDate: date,
  dueDate: date,
  estimatedMinutes: z
    .number({ error: "预计工时需为数字" })
    .int("预计工时需为整数分钟")
    .min(0, "预计工时不能为负数")
    .max(1000000, "预计工时过大")
    .nullable()
    .optional(),
  priority: z
    .enum(["low", "medium", "high"], { error: "任务优先级无效" })
    .optional(),
  sortOrder: z
    .number({ error: "排序位置无效" })
    .finite("排序位置无效")
    .optional(),
});
export const taskCreateSchema = taskFieldsSchema.extend({
  assigneeId: z.uuid("负责人无效").optional(),
});
export const taskPatchSchema = taskFieldsSchema.partial();

export function assertTaskDates(input: {
  startDate?: string | null;
  dueDate?: string | null;
}) {
  if (input.startDate && input.dueDate && input.startDate > input.dueDate)
    throw new AppError("截止日期不能早于开始日期");
}

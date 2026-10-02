import { z } from "zod";
import {
  getTaskDetail,
  transitionTask,
  updateTask,
  type TaskPatch,
} from "@/modules/tasks";
import { TASK_STATUSES } from "@/modules/tasks/client";
import { requireProjectForUser, AppError, ConflictError } from "@/modules/core";
import { getMoveTransition } from "./model";

export * from "./model";

export const movePatchSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: z.uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  milestoneId: z.uuid().nullable().optional(),
  sortOrder: z.number().finite().optional(),
  note: z.string().trim().max(5000).optional(),
});

export type MovePatch = z.infer<typeof movePatchSchema>;

export async function moveTask(
  actorId: string,
  taskId: string,
  input: MovePatch,
) {
  const task = await getTaskDetail(actorId, taskId);
  const access = await requireProjectForUser(actorId, task.projectId);
  const parsed = movePatchSchema.safeParse(input);
  if (!parsed.success) throw new AppError("看板移动参数无效");
  const patch = parsed.data;
  const attrs: TaskPatch = {};
  if (patch.sortOrder !== undefined) attrs.sortOrder = patch.sortOrder;
  if (patch.priority !== undefined) attrs.priority = patch.priority;
  if (patch.milestoneId !== undefined) attrs.milestoneId = patch.milestoneId;
  const changesStatus =
    patch.status !== undefined && patch.status !== task.status;
  const changesAssignee =
    patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId;
  if (
    (changesStatus && changesAssignee) ||
    ((changesStatus || changesAssignee) && Object.keys(attrs).length > 0)
  ) {
    throw new AppError("请分别调整状态、负责人和任务属性");
  }
  if (changesAssignee) {
    if (patch.assigneeId === null)
      return transitionTask(actorId, taskId, "unclaim");
    return transitionTask(actorId, taskId, "assign", {
      assigneeId: patch.assigneeId ?? undefined,
    });
  }
  if (changesStatus && patch.status) {
    const rule = getMoveTransition(task, patch.status, access.role, actorId);
    if (!rule)
      throw new ConflictError(
        "当前状态或权限不允许移到该列，请使用任务操作查看可用路径",
      );
    return transitionTask(actorId, taskId, rule.action, { note: patch.note });
  }
  if (Object.keys(attrs).length === 0) return task;
  return updateTask(actorId, taskId, attrs);
}

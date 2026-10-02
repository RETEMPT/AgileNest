import type { TaskPriority } from "@/db/schema";
import type { TaskDTO } from "@/modules/tasks";

export type GroupBy = "status" | "assignee" | "priority" | "milestone";

export type ColumnDef = {
  id: string;
  title: string;
  tasks: TaskDTO[];
};

export type BoardFilters = {
  status?: string[];
  assigneeId?: string;
  priority?: string[];
  milestoneId?: string;
};

/** 拖拽落点要改的字段：指派走状态机 assign，其余走 updateTask。 */
export type MoveTaskPatch = {
  assigneeId?: string | null;
  priority?: TaskPriority;
  milestoneId?: string | null;
  sortOrder?: number;
};

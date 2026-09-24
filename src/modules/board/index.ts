import { NotImplementedError } from "@/modules/core/errors";
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

// —— Owner B（feature/board-views）填实 ——

export function deriveColumns(
  tasks: TaskDTO[],
  groupBy: GroupBy,
): ColumnDef[] {
  void tasks; void groupBy;
  throw new NotImplementedError("deriveColumns");
}

export function applyFilters(tasks: TaskDTO[], f: BoardFilters): TaskDTO[] {
  void tasks; void f;
  throw new NotImplementedError("applyFilters");
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  void params;
  throw new NotImplementedError("parseFilters");
}

export function serializeFilters(f: BoardFilters): URLSearchParams {
  void f;
  throw new NotImplementedError("serializeFilters");
}

export async function moveTask(
  actorId: string,
  taskId: string,
  patch: { status?: string; assigneeId?: string | null; priority?: string; milestoneId?: string | null; sortOrder?: number },
): Promise<TaskDTO> {
  void actorId; void taskId; void patch;
  throw new NotImplementedError("moveTask");
}

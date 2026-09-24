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

export function deriveColumns(_tasks: TaskDTO[], _groupBy: GroupBy): ColumnDef[] {
  throw new NotImplementedError("deriveColumns");
}

export function applyFilters(_tasks: TaskDTO[], _f: BoardFilters): TaskDTO[] {
  throw new NotImplementedError("applyFilters");
}

export function parseFilters(_params: URLSearchParams): BoardFilters {
  throw new NotImplementedError("parseFilters");
}

export function serializeFilters(_f: BoardFilters): URLSearchParams {
  throw new NotImplementedError("serializeFilters");
}

export async function moveTask(
  _actorId: string,
  _taskId: string,
  _patch: {
    status?: string;
    assigneeId?: string | null;
    priority?: string;
    milestoneId?: string | null;
    sortOrder?: number;
  },
): Promise<TaskDTO> {
  throw new NotImplementedError("moveTask");
}

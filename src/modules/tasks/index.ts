import { NotImplementedError } from "@/modules/core/errors";
import type { TaskPriority, TaskStatus } from "@/db/schema";

export type TaskDTO = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  completionNote: string | null;
  rejectReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskPatch = {
  title?: string;
  description?: string | null;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  priority?: TaskPriority;
  sortOrder?: number;
};

export type TransitionInput = {
  note?: string;
  assigneeId?: string;
};

export type TransitionAction =
  | "claim"
  | "unclaim"
  | "assign"
  | "submit"
  | "resubmit"
  | "accept"
  | "reject"
  | "reopen";

// —— Owner A（feature/tasks-status）填实 ——

export async function listProjectTasks(
  _actorId: string,
  _projectId: string,
  _filters?: {
    status?: TaskStatus[];
    assigneeId?: string;
    milestoneId?: string;
    parentTaskId?: string | null;
  },
): Promise<TaskDTO[]> {
  throw new NotImplementedError("listProjectTasks");
}

export async function getTaskDetail(
  _actorId: string,
  _taskId: string,
): Promise<TaskDTO & { subtasks: TaskDTO[] }> {
  throw new NotImplementedError("getTaskDetail");
}

export async function createTask(
  _actorId: string,
  _projectId: string,
  _input: {
    title: string;
    description?: string;
    assigneeId?: string;
    milestoneId?: string;
    parentTaskId?: string;
    startDate?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: TaskPriority;
  },
): Promise<TaskDTO> {
  throw new NotImplementedError("createTask");
}

export async function updateTask(
  _actorId: string,
  _taskId: string,
  _patch: TaskPatch,
): Promise<TaskDTO> {
  throw new NotImplementedError("updateTask");
}

export async function deleteTask(_actorId: string, _taskId: string): Promise<void> {
  throw new NotImplementedError("deleteTask");
}

export async function transitionTask(
  _actorId: string,
  _taskId: string,
  _action: TransitionAction,
  _input?: TransitionInput,
): Promise<TaskDTO> {
  throw new NotImplementedError("transitionTask");
}

export async function createSubtask(
  _actorId: string,
  _parentTaskId: string,
  _input: { title: string; description?: string; dueDate?: string },
): Promise<TaskDTO> {
  throw new NotImplementedError("createSubtask");
}

export async function listSubtasks(
  _actorId: string,
  _parentTaskId: string,
): Promise<TaskDTO[]> {
  throw new NotImplementedError("listSubtasks");
}

export async function setDueDate(
  _actorId: string,
  _taskId: string,
  _dueDate: string | null,
): Promise<TaskDTO> {
  throw new NotImplementedError("setDueDate");
}

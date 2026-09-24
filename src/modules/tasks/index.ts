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

// —— Owner A（feature/tasks-status）填实以下签名 ——

export async function listProjectTasks(
  actorId: string,
  projectId: string,
  filters?: {
    status?: TaskStatus[];
    assigneeId?: string;
    milestoneId?: string;
    parentTaskId?: string | null;
  },
): Promise<TaskDTO[]> {
  void actorId; void projectId; void filters;
  throw new NotImplementedError("listProjectTasks");
}

export async function getTaskDetail(
  actorId: string,
  taskId: string,
): Promise<TaskDTO & { subtasks: TaskDTO[] }> {
  void actorId; void taskId;
  throw new NotImplementedError("getTaskDetail");
}

export async function createTask(
  actorId: string,
  projectId: string,
  input: {
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
  void actorId; void projectId; void input;
  throw new NotImplementedError("createTask");
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
): Promise<TaskDTO> {
  void actorId; void taskId; void patch;
  throw new NotImplementedError("updateTask");
}

export async function deleteTask(actorId: string, taskId: string): Promise<void> {
  void actorId; void taskId;
  throw new NotImplementedError("deleteTask");
}

export async function transitionTask(
  actorId: string,
  taskId: string,
  action:
    | "claim"
    | "unclaim"
    | "assign"
    | "submit"
    | "resubmit"
    | "accept"
    | "reject"
    | "reopen",
  input?: TransitionInput,
): Promise<TaskDTO> {
  void actorId; void taskId; void action; void input;
  throw new NotImplementedError("transitionTask");
}

export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: { title: string; description?: string; dueDate?: string },
): Promise<TaskDTO> {
  void actorId; void parentTaskId; void input;
  throw new NotImplementedError("createSubtask");
}

export async function listSubtasks(
  actorId: string,
  parentTaskId: string,
): Promise<TaskDTO[]> {
  void actorId; void parentTaskId;
  throw new NotImplementedError("listSubtasks");
}

export async function setDueDate(
  actorId: string,
  taskId: string,
  dueDate: string | null,
): Promise<TaskDTO> {
  void actorId; void taskId; void dueDate;
  throw new NotImplementedError("setDueDate");
}

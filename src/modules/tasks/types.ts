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

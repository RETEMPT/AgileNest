import { NotImplementedError } from "@/modules/core/errors";

export type Completion = {
  taskId: string;
  done: number;
  total: number;
  ratio: number; // 0..1，含子任务加权
};

export type HoursRollup = {
  userId: string;
  userName: string | null;
  minutes: number;
};

export type Contribution = {
  userId: string;
  userName: string | null;
  tasksAccepted: number;
  tasksSubmitted: number;
  minutes: number;
};

// —— Owner D（feature/worklog-stats）填实 ——

export async function completionRatio(
  actorId: string,
  taskId: string,
): Promise<Completion> {
  void actorId; void taskId;
  throw new NotImplementedError("completionRatio");
}

export async function projectCompletion(
  actorId: string,
  projectId: string,
): Promise<Completion> {
  void actorId; void projectId;
  throw new NotImplementedError("projectCompletion");
}

export async function taskHours(
  actorId: string,
  projectId: string,
  range?: { from?: string; to?: string },
): Promise<HoursRollup[]> {
  void actorId; void projectId; void range;
  throw new NotImplementedError("taskHours");
}

export async function memberContribution(
  actorId: string,
  projectId: string,
): Promise<Contribution[]> {
  void actorId; void projectId;
  throw new NotImplementedError("memberContribution");
}

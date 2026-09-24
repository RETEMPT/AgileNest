import { NotImplementedError } from "@/modules/core/errors";

export type WorklogDTO = {
  id: string;
  taskId: string;
  userId: string;
  userName: string | null;
  workDate: string;
  minutes: number;
  note: string | null;
  createdAt: Date;
};

export type Completion = {
  taskId: string;
  done: number;
  total: number;
  /** 0..1，含子任务加权 */
  ratio: number;
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

export async function addWorklog(
  _actorId: string,
  _taskId: string,
  _input: { workDate: string; minutes: number; note?: string },
): Promise<WorklogDTO> {
  throw new NotImplementedError("addWorklog");
}

export async function listWorklogs(
  _actorId: string,
  _taskId: string,
): Promise<WorklogDTO[]> {
  throw new NotImplementedError("listWorklogs");
}

export async function deleteWorklog(
  _actorId: string,
  _worklogId: string,
): Promise<void> {
  throw new NotImplementedError("deleteWorklog");
}

export async function completionRatio(
  _actorId: string,
  _taskId: string,
): Promise<Completion> {
  throw new NotImplementedError("completionRatio");
}

export async function projectCompletion(
  _actorId: string,
  _projectId: string,
): Promise<Completion> {
  throw new NotImplementedError("projectCompletion");
}

export async function taskHours(
  _actorId: string,
  _projectId: string,
  _range?: { from?: string; to?: string },
): Promise<HoursRollup[]> {
  throw new NotImplementedError("taskHours");
}

export async function memberContribution(
  _actorId: string,
  _projectId: string,
): Promise<Contribution[]> {
  throw new NotImplementedError("memberContribution");
}

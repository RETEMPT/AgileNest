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

// —— Owner D（feature/worklog-stats）填实 ——

export async function addWorklog(
  actorId: string,
  taskId: string,
  input: { workDate: string; minutes: number; note?: string },
): Promise<WorklogDTO> {
  void actorId; void taskId; void input;
  throw new NotImplementedError("addWorklog");
}

export async function listWorklogs(
  actorId: string,
  taskId: string,
): Promise<WorklogDTO[]> {
  void actorId; void taskId;
  throw new NotImplementedError("listWorklogs");
}

export async function deleteWorklog(
  actorId: string,
  worklogId: string,
): Promise<void> {
  void actorId; void worklogId;
  throw new NotImplementedError("deleteWorklog");
}

import { NotImplementedError } from "@/modules/core/errors";
import type { TaskDTO } from "@/modules/tasks";

export type ReviewItem = TaskDTO & {
  submitterName: string | null;
  submittedAt: Date | null;
  completionNote: string | null;
};

export type EventDTO = {
  id: string;
  taskId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  note: string | null;
  createdAt: Date;
};

// —— Owner C（feature/review-portal）填实 ——

/** 学生工作台三列 */
export async function listMyTodo(_actorId: string): Promise<TaskDTO[]> {
  throw new NotImplementedError("listMyTodo");
}

export async function listMyInProgress(_actorId: string): Promise<TaskDTO[]> {
  throw new NotImplementedError("listMyInProgress");
}

export async function listMyRejected(_actorId: string): Promise<TaskDTO[]> {
  throw new NotImplementedError("listMyRejected");
}

export async function listUnclaimedPool(
  _actorId: string,
  _projectId: string,
): Promise<TaskDTO[]> {
  throw new NotImplementedError("listUnclaimedPool");
}

/** 教师监督台 */
export async function listPendingReview(
  _actorId: string,
  _projectId: string,
): Promise<ReviewItem[]> {
  throw new NotImplementedError("listPendingReview");
}

export async function listOverdueRisks(
  _actorId: string,
  _projectId: string,
): Promise<TaskDTO[]> {
  throw new NotImplementedError("listOverdueRisks");
}

export async function listTaskEvents(
  _actorId: string,
  _taskId: string,
): Promise<EventDTO[]> {
  throw new NotImplementedError("listTaskEvents");
}

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

/** 学生工作台：我的三列 */
export async function listMyTodo(actorId: string): Promise<TaskDTO[]> {
  void actorId;
  throw new NotImplementedError("listMyTodo");
}

export async function listMyInProgress(actorId: string): Promise<TaskDTO[]> {
  void actorId;
  throw new NotImplementedError("listMyInProgress");
}

export async function listMyRejected(actorId: string): Promise<TaskDTO[]> {
  void actorId;
  throw new NotImplementedError("listMyRejected");
}

export async function listUnclaimedPool(
  actorId: string,
  projectId: string,
): Promise<TaskDTO[]> {
  void actorId; void projectId;
  throw new NotImplementedError("listUnclaimedPool");
}

/** 教师监督台 */
export async function listPendingReview(
  actorId: string,
  projectId: string,
): Promise<ReviewItem[]> {
  void actorId; void projectId;
  throw new NotImplementedError("listPendingReview");
}

export async function listOverdueRisks(
  actorId: string,
  projectId: string,
): Promise<TaskDTO[]> {
  void actorId; void projectId;
  throw new NotImplementedError("listOverdueRisks");
}

export async function listTaskEvents(
  actorId: string,
  taskId: string,
): Promise<EventDTO[]> {
  void actorId; void taskId;
  throw new NotImplementedError("listTaskEvents");
}

import { and, desc, eq } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { tasks, taskSubmissions, taskSubmissionReviews } from "@/db/schema";
import { ConflictError, NotFoundError, requireProjectForUser } from "@/modules/core";
import type { SubmissionDTO } from "./delivery-types";

export type ApprovedTaskSubmission = { taskId: string; taskTitle: string; submission: SubmissionDTO };

function approvedDTO(row: typeof taskSubmissions.$inferSelect, review: typeof taskSubmissionReviews.$inferSelect): SubmissionDTO {
  return { ...row, submittedAt: row.submittedAt.toISOString(), review: { action: review.action, reviewerName: review.reviewerName, reviewedAt: review.reviewedAt.toISOString(), summary: review.summary, checks: review.checks } };
}

export async function listApprovedTaskSubmissions(actorId: string, projectId: string): Promise<ApprovedTaskSubmission[]> {
  await requireProjectForUser(actorId, projectId);
  const rows = await db.select({ taskId: tasks.id, taskTitle: tasks.title, submission: taskSubmissions, review: taskSubmissionReviews }).from(tasks)
    .innerJoin(taskSubmissions, eq(taskSubmissions.taskId, tasks.id)).innerJoin(taskSubmissionReviews, eq(taskSubmissionReviews.submissionId, taskSubmissions.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "accepted"), eq(taskSubmissionReviews.action, "accept"))).orderBy(desc(taskSubmissions.version));
  return rows.map((row) => ({ taskId: row.taskId, taskTitle: row.taskTitle, submission: approvedDTO(row.submission, row.review) }));
}

export async function getApprovedTaskSubmission(actorId: string, projectId: string, taskId: string, submissionId: string, connection: DbTx = db): Promise<ApprovedTaskSubmission> {
  await requireProjectForUser(actorId, projectId);
  const [task] = await connection.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId))).for("update");
  if (!task) throw new NotFoundError("所选任务不属于当前项目");
  if (task.status !== "accepted") throw new ConflictError("所选任务当前尚未验收通过，请先完成任务验收");
  const [row] = await connection.select({ submission: taskSubmissions, review: taskSubmissionReviews }).from(taskSubmissions)
    .innerJoin(taskSubmissionReviews, eq(taskSubmissionReviews.submissionId, taskSubmissions.id))
    .where(and(eq(taskSubmissions.id, submissionId), eq(taskSubmissions.taskId, taskId), eq(taskSubmissionReviews.action, "accept")));
  if (!row) throw new ConflictError("请选择该任务真实验收通过的提交版本");
  return { taskId, taskTitle: task.title, submission: approvedDTO(row.submission, row.review) };
}

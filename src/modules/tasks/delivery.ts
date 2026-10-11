import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { taskRequirements, taskSubmissions, taskSubmissionReviews, taskAcceptanceEvents, tasks, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import { bindSubmissionResources } from "@/modules/resources";
import type { AcceptanceCriterion, DeliveryInput, ReviewInput, SubmissionDTO, TaskDeliveryDTO } from "./delivery-types";
import { checksMatchCriteria, deliverySchema, requirementsSchema, reviewSchema } from "./delivery-validation";
import { lockTeamTaskAccess } from "./task-locks";

type TaskRow = typeof tasks.$inferSelect;

async function legacySubmission(row: TaskRow, connection: DbTx): Promise<SubmissionDTO | null> {
  if (row.status !== "submitted" || !row.submittedAt) return null;
  const [event] = await connection.select({ actorId: taskAcceptanceEvents.actorId, name: users.name })
    .from(taskAcceptanceEvents).leftJoin(users, eq(users.id, taskAcceptanceEvents.actorId))
    .where(and(eq(taskAcceptanceEvents.taskId, row.id), inArray(taskAcceptanceEvents.action, ["submit", "resubmit"])))
    .orderBy(desc(taskAcceptanceEvents.createdAt)).limit(1);
  return {
    id: `legacy:${row.id}:${row.submittedAt.toISOString()}`, taskId: row.id, version: 1,
    submittedById: event?.actorId ?? null, submittedByName: event?.name ?? null,
    submittedAt: row.submittedAt.toISOString(), summary: row.completionNote ?? "",
    verification: "", links: [], resources: [], criteria: [], review: null, source: "legacy",
  };
}

export async function getTaskDelivery(actorId: string, taskId: string): Promise<TaskDeliveryDTO> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  await requireProjectForUser(actorId, task.projectId);
  const [[requirements], rows] = await Promise.all([
    db.select().from(taskRequirements).where(eq(taskRequirements.taskId, taskId)),
    db.select({ submission: taskSubmissions, review: taskSubmissionReviews }).from(taskSubmissions)
      .leftJoin(taskSubmissionReviews, eq(taskSubmissionReviews.submissionId, taskSubmissions.id))
      .where(eq(taskSubmissions.taskId, taskId)).orderBy(desc(taskSubmissions.version)),
  ]);
  const submissions: SubmissionDTO[] = rows.map(({ submission, review }) => ({
    ...submission, submittedAt: submission.submittedAt.toISOString(),
    review: review ? {
      action: review.action, reviewerName: review.reviewerName, reviewedAt: review.reviewedAt.toISOString(),
      summary: review.summary, checks: review.checks,
    } : null,
  }));
  if (!submissions.length) {
    const legacy = await legacySubmission(task, db);
    if (legacy) submissions.push(legacy);
  }
  return { requirements: requirements ? { version: requirements.version, criteria: requirements.criteria } : { version: 0, criteria: [] }, submissions };
}

export async function saveTaskRequirements(actorId: string, taskId: string, input: { version: number; criteria: AcceptanceCriterion[] }) {
  const [initial] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!initial) throw new NotFoundError("任务不存在");
  const access = await requireProjectForUser(actorId, initial.projectId);
  if (!access.capabilities.task.actions.includes("update")) throw new ForbiddenError();
  const parsed = requirementsSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return db.transaction(async (tx) => {
    await lockTeamTaskAccess(tx, actorId, initial.projectId, access.project.teamId, "update");
    if (initial.parentTaskId) await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, initial.parentTaskId)).for("update");
    const [currentTask] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!currentTask) throw new NotFoundError("任务不存在");
    if (["submitted", "accepted"].includes(currentTask.status)) throw new ConflictError("待验收或已完成的任务不能修改验收要求，请先打回或重新打开；原提交与评审快照继续保留");
    const [current] = await tx.select().from(taskRequirements).where(eq(taskRequirements.taskId, taskId));
    if ((current?.version ?? 0) !== parsed.data.version) throw new ConflictError("验收要求已被修改，请重新加载后再保存");
    const next = { version: parsed.data.version + 1, criteria: parsed.data.criteria };
    const now = new Date();
    await tx.insert(taskRequirements).values({ taskId, ...next, updatedAt: now }).onConflictDoUpdate({
      target: taskRequirements.taskId, set: { ...next, updatedAt: now },
    });
    await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
    await tx.insert(taskAcceptanceEvents).values({ taskId, actorId, action: "update", note: `更新验收要求 v${next.version}`, createdAt: now });
    return next;
  });
}

export async function writeSubmission(tx: DbTx, actorId: string, row: TaskRow, input: DeliveryInput | undefined, now: Date): Promise<string> {
  if (!input) throw new AppError("请填写完成说明、验证结果，并提供成果证据");
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const delivery = parsed.data;
  const [requirements] = await tx.select().from(taskRequirements).where(eq(taskRequirements.taskId, row.id));
  if (!requirements?.criteria.length) throw new AppError("请先设置至少一项验收要求，再提交成果");
  if (requirements.version !== delivery.requirementsVersion) throw new ConflictError("验收要求已变化，请重新加载并核对后提交");
  if (!checksMatchCriteria(requirements.criteria, delivery.checks)) throw new AppError("请逐项填写当前验收要求的自检结果");
  if (new Set(delivery.resourceIds).size !== delivery.resourceIds.length) throw new AppError("成果文件不能重复");
  const [latest] = await tx.select({ version: taskSubmissions.version }).from(taskSubmissions)
    .where(eq(taskSubmissions.taskId, row.id)).orderBy(desc(taskSubmissions.version)).limit(1);
  const [author] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
  const [submission] = await tx.insert(taskSubmissions).values({
    taskId: row.id, version: (latest?.version ?? 0) + 1, submittedById: actorId, submittedByName: author?.name ?? null, submittedAt: now,
    summary: delivery.summary, verification: delivery.verification, links: delivery.links, resources: [],
    criteria: requirements.criteria.map((criterion) => {
      const check = delivery.checks.find((item) => item.criterionId === criterion.id)!;
      return { ...criterion, met: check.met, ...(check.note !== undefined && { note: check.note }) };
    }),
    source: "structured",
  }).returning({ id: taskSubmissions.id });
  const resources = await bindSubmissionResources(actorId, row.projectId, delivery.resourceIds, submission.id, tx);
  // 引用绑定需要提交已存在；证据快照在同一事务内填充，提交后不再修改。
  await tx.update(taskSubmissions).set({ resources }).where(eq(taskSubmissions.id, submission.id));
  return delivery.summary;
}

export async function writeReview(tx: DbTx, actorId: string, row: TaskRow, action: "accept" | "reject", input: ReviewInput | undefined, now: Date): Promise<string> {
  if (!input) throw new AppError("请选择当前提交版本并填写逐项验收意见");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const review = parsed.data;
  let [current] = await tx.select().from(taskSubmissions).where(eq(taskSubmissions.taskId, row.id))
    .orderBy(desc(taskSubmissions.version)).limit(1);
  if (!current) {
    const legacy = await legacySubmission(row, tx);
    if (!legacy || legacy.id !== review.submissionId) throw new ConflictError("历史提交已变化，请重新加载后明确选择当前历史版本");
    [current] = await tx.insert(taskSubmissions).values({
      taskId: row.id, version: 1, submittedById: legacy.submittedById, submittedByName: legacy.submittedByName,
      submittedAt: new Date(legacy.submittedAt), summary: legacy.summary, verification: "", links: [], resources: [], criteria: [], source: "legacy",
    }).returning();
  } else if (current.id !== review.submissionId) {
    throw new ConflictError("提交版本已变化，请重新加载后验收当前版本");
  }
  const [existing] = await tx.select({ id: taskSubmissionReviews.id }).from(taskSubmissionReviews).where(eq(taskSubmissionReviews.submissionId, current.id));
  if (existing) throw new ConflictError("该提交版本已经评审，请重新加载");
  if (!checksMatchCriteria(current.criteria, review.checks)) throw new AppError("请逐项确认当前提交快照的验收结果");
  if (action === "accept" && review.checks.some((check) => !check.passed)) throw new AppError("所有验收项通过后才能验收任务");
  if (action === "reject" && current.criteria.length) {
    const failed = review.checks.filter((check) => !check.passed);
    if (!failed.length) throw new AppError("请标明至少一项需要修改的验收要求");
    if (failed.some((check) => !check.note?.trim())) throw new AppError("请为每项未通过要求填写问题位置和通过条件");
  }
  const [reviewer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
  await tx.insert(taskSubmissionReviews).values({
    submissionId: current.id, reviewerId: actorId, reviewerName: reviewer?.name ?? null,
    action, summary: review.summary, checks: review.checks, reviewedAt: now,
  });
  return review.summary;
}

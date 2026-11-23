import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks, taskVersions, users } from "@/db/schema";
import { AppError, NotFoundError, requireProjectForUser } from "@/modules/core";

export const taskVersionCreateSchema = z.object({
  content: z.string().trim().min(1, "请填写版本内容").max(20000, "内容最多 20000 字"),
  remark: z.string().trim().max(500, "备注最多 500 字").default(""),
});
export type TaskVersionCreateInput = z.input<typeof taskVersionCreateSchema>;

export type TaskVersionDTO = {
  id: string;
  taskId: string;
  content: string;
  version: number;
  remark: string;
  createdById: string | null;
  authorName: string | null;
  createdAt: string;
};

/** 校验任务存在且当前用户是其团队成员，返回 projectId。 */
async function requireTask(actorId: string, taskId: string): Promise<string> {
  const [task] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  await requireProjectForUser(actorId, task.projectId);
  return task.projectId;
}

export async function listTaskVersions(actorId: string, taskId: string): Promise<TaskVersionDTO[]> {
  await requireTask(actorId, taskId);
  const rows = await db
    .select({ v: taskVersions, authorName: users.name })
    .from(taskVersions)
    .leftJoin(users, eq(users.id, taskVersions.createdById))
    .where(eq(taskVersions.taskId, taskId))
    .orderBy(desc(taskVersions.version));
  return rows.map(({ v, authorName }) => ({
    id: v.id,
    taskId: v.taskId,
    content: v.content,
    version: v.version,
    remark: v.remark,
    createdById: v.createdById,
    authorName,
    createdAt: v.createdAt.toISOString(),
  }));
}

export async function createTaskVersion(
  actorId: string,
  taskId: string,
  input: TaskVersionCreateInput,
): Promise<{ version: TaskVersionDTO; projectId: string }> {
  const parsed = taskVersionCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const projectId = await requireTask(actorId, taskId);
  const created = await db.transaction(async (tx) => {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).for("update");
    const [max] = await tx
      .select({ v: sql<number>`coalesce(max(${taskVersions.version}), 0)` })
      .from(taskVersions)
      .where(eq(taskVersions.taskId, taskId));
    const [row] = await tx
      .insert(taskVersions)
      .values({ taskId, content: parsed.data.content, remark: parsed.data.remark, version: (max?.v ?? 0) + 1, createdById: actorId })
      .returning();
    return row;
  });
  return {
    projectId,
    version: {
      id: created.id,
      taskId: created.taskId,
      content: created.content,
      version: created.version,
      remark: created.remark,
      createdById: created.createdById,
      authorName: null,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

import { db } from "@/db";
import { milestones, tasks, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { makeFixture, makeUser, resetDb } from "../../helpers";
import type { TaskPriority, TaskStatus } from "@/db/schema";

export { makeFixture, makeUser, resetDb };

/** 把成员提升为 teacher（日历只读场景）。 */
export async function asTeacher(teamId: string, userId: string) {
  await db
    .update(teamMembers)
    .set({ role: "teacher" })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}

export async function addTask(input: {
  projectId: string;
  title?: string;
  startDate?: string | null;
  dueDate?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  milestoneId?: string | null;
  createdById?: string | null;
}) {
  const [row] = await db
    .insert(tasks)
    .values({
      projectId: input.projectId,
      title: input.title ?? "任务",
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? "unclaimed",
      priority: input.priority ?? "medium",
      assigneeId: input.assigneeId ?? null,
      milestoneId: input.milestoneId ?? null,
      createdById: input.createdById ?? null,
    })
    .returning();
  return row;
}

export async function addMilestoneRow(input: {
  projectId: string;
  title: string;
  targetDate?: string | null;
}) {
  const [row] = await db
    .insert(milestones)
    .values({
      projectId: input.projectId,
      title: input.title,
      targetDate: input.targetDate ?? null,
    })
    .returning();
  return row;
}

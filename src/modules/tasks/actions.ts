"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/modules/core/session";
import { AppError } from "@/modules/core/errors";
import {
  createTask,
  deleteTask,
  transitionTask,
  updateTask,
} from "@/modules/tasks";
import type { TransitionAction } from "@/modules/tasks";
import { addWorklog } from "@/modules/worklog";
import { createMilestone } from "@/modules/milestone";

export type FormState = { error: string; ok?: string } | null;

function fail(e: unknown): FormState {
  if (e instanceof AppError) return { error: e.message };
  console.error("[actions]", e);
  return { error: "操作失败，请稍后重试" };
}

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "请填写标题"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export async function createTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createTask(user.id, parsed.data.projectId, {
      title: parsed.data.title,
      description: parsed.data.description || undefined,
      dueDate: parsed.data.dueDate || undefined,
      priority: parsed.data.priority,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks`);
  revalidatePath(`/p/${parsed.data.projectId}/board`);
  return { error: "", ok: "已创建" };
}

const transitionSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  action: z.string().min(1),
  note: z.string().optional(),
  assigneeId: z.string().optional(),
});

export async function transitionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await transitionTask(
      user.id,
      parsed.data.taskId,
      parsed.data.action as TransitionAction,
      { note: parsed.data.note, assigneeId: parsed.data.assigneeId },
    );
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks`);
  revalidatePath(`/p/${parsed.data.projectId}/board`);
  revalidatePath(`/p/${parsed.data.projectId}/review`);
  revalidatePath(`/p/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  revalidatePath(`/home/student`);
  revalidatePath(`/home/teacher`);
  return { error: "", ok: "已更新" };
}

export async function deleteTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!taskId) return { error: "缺少任务" };
  try {
    await deleteTask(user.id, taskId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${projectId}/tasks`);
  revalidatePath(`/p/${projectId}/board`);
  return { error: "", ok: "已删除" };
}

const worklogSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  workDate: z.string().min(1),
  minutes: z.coerce.number().int().positive("工时需为正整数分钟"),
  note: z.string().optional(),
});

export async function addWorklogAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = worklogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await addWorklog(user.id, parsed.data.taskId, {
      workDate: parsed.data.workDate,
      minutes: parsed.data.minutes,
      note: parsed.data.note || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  revalidatePath(`/p/${parsed.data.projectId}/stats`);
  return { error: "", ok: "已记工时" };
}

const milestoneSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "请填写标题"),
  kind: z.enum(["open_topic", "midterm", "final", "defense", "custom"]).optional(),
  targetDate: z.string().optional(),
});

export async function createMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = milestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createMilestone(user.id, parsed.data.projectId, {
      title: parsed.data.title,
      kind: parsed.data.kind,
      targetDate: parsed.data.targetDate || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/milestones`);
  return { error: "", ok: "已创建" };
}

const dueSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  dueDate: z.string().optional(),
});

export async function setDueDateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = dueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateTask(user.id, parsed.data.taskId, {
      dueDate: parsed.data.dueDate || null,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return { error: "", ok: "已改截止日期" };
}

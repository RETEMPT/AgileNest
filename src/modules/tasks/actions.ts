"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/modules/core/errors";
import { requireUser } from "@/modules/core/session";

import {
  createSubtask,
  createTask,
  setDueDate,
  transitionTask,
} from "./service";
import type { TransitionAction, TransitionInput } from "./types";

export type ActionResult = { ok: true } | { error: string };

async function guard(action: () => Promise<unknown>, path: string): Promise<ActionResult> {
  try {
    await action();
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function transitionTaskAction(
  projectId: string,
  taskId: string,
  action: TransitionAction,
  input?: TransitionInput,
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => transitionTask(user.id, taskId, action, input), `/p/${projectId}`);
}

export async function createTaskAction(
  projectId: string,
  input: {
    title: string;
    description?: string;
    priority?: "high" | "medium" | "low";
    dueDate?: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => createTask(user.id, projectId, input), `/p/${projectId}`);
}

export async function createSubtaskAction(
  projectId: string,
  parentTaskId: string,
  input: { title: string; description?: string; dueDate?: string },
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => createSubtask(user.id, parentTaskId, input), `/p/${projectId}`);
}

export async function setDueDateAction(
  projectId: string,
  taskId: string,
  dueDate: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => setDueDate(user.id, taskId, dueDate), `/p/${projectId}`);
}

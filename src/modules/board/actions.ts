"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/modules/core/errors";
import { requireUser } from "@/modules/core/session";
import { createTask, transitionTask } from "@/modules/tasks";
import type {
  TransitionAction,
  TransitionInput,
} from "@/modules/tasks";

import { moveTask } from "./service";
import type { MoveTaskPatch } from "./types";

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

export async function moveTaskAction(
  projectId: string,
  taskId: string,
  patch: MoveTaskPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => moveTask(user.id, taskId, patch), `/p/${projectId}`);
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
  input: { title: string; description?: string; priority?: "high" | "medium" | "low" },
): Promise<ActionResult> {
  const user = await requireUser();
  return guard(() => createTask(user.id, projectId, input), `/p/${projectId}`);
}

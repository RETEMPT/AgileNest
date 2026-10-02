"use server";

import { revalidatePath } from "next/cache";
import { requireUser, toFormError } from "@/modules/core";
import { moveTask, type MovePatch } from "./index";

export async function moveTaskAction(taskId: string, patch: MovePatch) {
  const user = await requireUser();
  try {
    const task = await moveTask(user.id, taskId, patch);
    revalidatePath(`/p/${task.projectId}`, "layout");
    revalidatePath("/home", "layout");
    revalidatePath("/t");
    return { error: "", ok: "任务状态已更新" };
  } catch (error) {
    return { error: toFormError(error, "移动失败，请刷新后重试"), ok: "" };
  }
}

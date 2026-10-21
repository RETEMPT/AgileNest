import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { ACCOUNT_CHANGED_MESSAGE } from "@/components/account-context";
import { requireModelRequestOrigin, readModelRequestBody } from "./api";
import { MODEL_COOKIE_NAME } from "./credentials";
import { applyTaskAssistance, assistExistingTask } from "./task-assistance";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function errorResponse(error: unknown) {
  const response = error instanceof AppError ? json({ error: error.message }, error.status) : json({ error: "任务建议暂时无法处理，请稍后重试" }, 500);
  if (error instanceof AppError && error.status === 409 && error.message === ACCOUNT_CHANGED_MESSAGE) response.headers.set("X-AgileNest-Account-Changed", "1");
  return response;
}

export async function taskAssistancePOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request);
    const user = await requireApiUser();
    return json(await assistExistingTask(user.id, request.cookies.get(MODEL_COOKIE_NAME)?.value, await readModelRequestBody(request), request.signal));
  } catch (error) { return errorResponse(error); }
}

export async function applyTaskAssistancePOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request);
    const user = await requireApiUser();
    const task = await applyTaskAssistance(user.id, await readModelRequestBody(request));
    for (const path of [`/p/${task.projectId}`, `/p/${task.projectId}/tasks`, `/p/${task.projectId}/tasks/${task.id}`, `/p/${task.projectId}/board`, `/p/${task.projectId}/table`, `/p/${task.projectId}/review`, `/p/${task.projectId}/stats`, `/p/${task.projectId}/milestones`, "/home"]) revalidatePath(path);
    return json({ task });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { getTaskDelivery, transitionTask } from "./service";
import { transitionBodySchema } from "./delivery-validation";

type TaskContext = { params: Promise<{ taskId: string }> };

export async function taskDeliveryGET(_request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    return NextResponse.json(await getTaskDelivery(user.id, z.uuid("任务无效").parse(taskId)));
  } catch (error) { return jsonError(error); }
}

export async function taskTransitionPOST(request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    const body = transitionBodySchema.parse(await request.json());
    const task = await transitionTask(user.id, z.uuid("任务无效").parse(taskId), body.action, body);
    return NextResponse.json({ task });
  } catch (error) { return jsonError(error); }
}

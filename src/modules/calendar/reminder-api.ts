import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { scheduleReminderInputSchema } from "./client";
import { scheduleIdSchema } from "./schema";
import { getMyScheduleReminder, saveMyScheduleReminder } from "./reminder-service";

type Context = { params: Promise<{ scheduleId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) { const response = jsonError(error); response.headers.set("Cache-Control", "private, no-store"); return response; }
async function readInput(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) throw new AppError("提醒设置内容过大");
  if (!request.body) throw new AppError("请填写提醒设置");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0; let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new AppError("提醒设置内容过大"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text) as unknown; } catch { throw new AppError("提醒设置格式无效"); }
}
export async function scheduleReminderGET(_request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { scheduleId } = await context.params;
    const id = scheduleIdSchema.parse(scheduleId);
    return NextResponse.json(await getMyScheduleReminder(user.id, id), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function scheduleReminderPUT(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { scheduleId } = await context.params;
    const id = scheduleIdSchema.parse(scheduleId);
    const input = scheduleReminderInputSchema.parse(await readInput(request));
    const reminder = await saveMyScheduleReminder(user.id, id, input);
    revalidatePath("/calendar");
    return NextResponse.json(reminder, { headers });
  } catch (error) { return errorResponse(error); }
}

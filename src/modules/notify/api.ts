import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppError } from "@/modules/core";
import { collectMyScheduleReminders } from "@/modules/calendar";
import { jsonError, requireApiUser } from "@/lib/api";
import { getMyNotificationFeed, listMyNotifications, markAllRead, markRead } from "./service";
import { getFollowState, getNotificationPreferences, listMyFollows, updateFollowState, updateNotificationPreferences } from "./subscriptions";
import { followTargetSchema } from "./client";
import { followUpdateSchema, preferencesUpdateSchema } from "./schema";

const privateHeaders = { "Cache-Control": "private, no-store" };
function privateError(error: unknown) {
  const response = jsonError(error);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
async function limitedBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new AppError("请求内容过大");
  if (!request.body) throw new AppError("请填写设置内容");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); throw new AppError("请求内容过大"); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(body) as unknown; } catch { throw new AppError("设置内容格式无效"); }
}

export async function notificationsGET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    if (query.get("summary") === "1") {
      await collectMyScheduleReminders(user.id);
      return NextResponse.json(await getMyNotificationFeed(user.id), { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ notifications: await listMyNotifications(user.id, { unreadOnly: query.get("unreadOnly") === "1" }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return privateError(error); }
}

export async function notificationsPOST(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    if (query.has("all")) {
      if (query.get("all") !== "1" || query.has("id")) throw new AppError("批量已读参数无效");
      const updated = await markAllRead(user.id);
      revalidatePath("/notifications");
      return NextResponse.json({ ok: true, updated }, { headers: privateHeaders });
    }
    if (!query.has("id")) throw new AppError("缺少消息编号");
    await markRead(user.id, z.uuid("消息编号无效").parse(query.get("id")));
    revalidatePath("/notifications");
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (error) { return privateError(error); }
}

export async function notificationPreferencesGET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json(await getNotificationPreferences(user.id), { headers: privateHeaders });
  } catch (error) { return privateError(error); }
}

export async function notificationPreferencesPUT(request: Request) {
  try {
    const user = await requireApiUser();
    const input = preferencesUpdateSchema.parse(await limitedBody(request));
    const preferences = await updateNotificationPreferences(user.id, input);
    revalidatePath("/notifications");
    return NextResponse.json(preferences, { headers: privateHeaders });
  } catch (error) { return privateError(error); }
}

export async function notificationFollowsGET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    if (!query.has("kind") && !query.has("id")) return NextResponse.json({ follows: await listMyFollows(user.id) }, { headers: privateHeaders });
    const target = followTargetSchema.parse({ kind: query.get("kind"), id: query.get("id") });
    return NextResponse.json(await getFollowState(user.id, target), { headers: privateHeaders });
  } catch (error) { return privateError(error); }
}

export async function notificationFollowsPUT(request: Request) {
  try {
    const user = await requireApiUser();
    const input = followUpdateSchema.parse(await limitedBody(request));
    return NextResponse.json(await updateFollowState(user.id, input), { headers: privateHeaders });
  } catch (error) { return privateError(error); }
}

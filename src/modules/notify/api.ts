import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppError } from "@/modules/core";
import { jsonError, requireApiUser } from "@/lib/api";
import { getMyNotificationFeed, listMyNotifications, markAllRead, markRead } from "./service";

export async function notificationsGET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    if (query.get("summary") === "1") {
      return NextResponse.json(await getMyNotificationFeed(user.id), { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ notifications: await listMyNotifications(user.id, { unreadOnly: query.get("unreadOnly") === "1" }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function notificationsPOST(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    if (query.has("all")) {
      if (query.get("all") !== "1" || query.has("id")) throw new AppError("批量已读参数无效");
      const updated = await markAllRead(user.id);
      revalidatePath("/notifications");
      return NextResponse.json({ ok: true, updated });
    }
    if (!query.has("id")) throw new AppError("缺少消息编号");
    await markRead(user.id, z.uuid("消息编号无效").parse(query.get("id")));
    revalidatePath("/notifications");
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

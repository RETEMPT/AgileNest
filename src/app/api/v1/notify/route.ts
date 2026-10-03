import { NextResponse } from "next/server";
import { listMyNotifications, markRead } from "@/modules/notify";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const unreadOnly = new URL(req.url).searchParams.get("unreadOnly") === "1";
    const notifications = await listMyNotifications(user.id, { unreadOnly });
    return NextResponse.json({ notifications });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("缺少 id");
    await markRead(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

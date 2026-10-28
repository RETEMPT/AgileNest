import { NextResponse } from "next/server";
import { listTaskEvents } from "@/modules/review";
import { jsonError, requireApiUser } from "@/lib/api";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireApiUser();
    const { taskId } = await ctx.params;
    const events = await listTaskEvents(user.id, taskId);
    return NextResponse.json({ events });
  } catch (e) {
    return jsonError(e);
  }
}

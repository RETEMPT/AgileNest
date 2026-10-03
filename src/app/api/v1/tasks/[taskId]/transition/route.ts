import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionTask } from "@/modules/tasks";
import { jsonError, requireApiUser } from "@/lib/api";

const schema = z.object({
  action: z.enum([
    "claim",
    "unclaim",
    "assign",
    "submit",
    "resubmit",
    "accept",
    "reject",
    "reopen",
  ]),
  note: z.string().optional(),
  assigneeId: z.string().optional(),
});

type Ctx = { params: Promise<{ taskId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiUser();
    const { taskId } = await ctx.params;
    const body = schema.parse(await req.json());
    const task = await transitionTask(user.id, taskId, body.action, {
      note: body.note,
      assigneeId: body.assigneeId,
    });
    return NextResponse.json({ task });
  } catch (e) {
    return jsonError(e);
  }
}

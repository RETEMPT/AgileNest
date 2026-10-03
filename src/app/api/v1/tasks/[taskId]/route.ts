import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTask, getTaskDetail, updateTask } from "@/modules/tasks";
import { jsonError, requireApiUser } from "@/lib/api";

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  sortOrder: z.number().optional(),
});

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireApiUser();
    const { taskId } = await ctx.params;
    const task = await getTaskDetail(user.id, taskId);
    return NextResponse.json({ task });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiUser();
    const { taskId } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const task = await updateTask(user.id, taskId, patch);
    return NextResponse.json({ task });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireApiUser();
    const { taskId } = await ctx.params;
    await deleteTask(user.id, taskId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

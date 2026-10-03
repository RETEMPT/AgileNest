import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addWorklog,
  deleteWorklog,
  listWorklogs,
} from "@/modules/worklog";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

const createSchema = z.object({
  taskId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().positive(),
  note: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) throw new AppError("缺少 taskId");
    const worklogs = await listWorklogs(user.id, taskId);
    return NextResponse.json({ worklogs });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = createSchema.parse(await req.json());
    const worklog = await addWorklog(user.id, body.taskId, body);
    return NextResponse.json({ worklog }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("缺少 id");
    await deleteWorklog(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

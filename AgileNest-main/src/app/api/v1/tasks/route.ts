import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listProjectTasks } from "@/modules/tasks";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";
import type { TaskStatus } from "@/db/schema";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  milestoneId: z.string().optional(),
  parentTaskId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedMinutes: z.number().int().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) throw new AppError("缺少 projectId");
    const status = url.searchParams.getAll("status") as TaskStatus[];
    const assigneeId = url.searchParams.get("assigneeId") ?? undefined;
    const milestoneId = url.searchParams.get("milestoneId") ?? undefined;
    const parentTaskId = url.searchParams.get("parentTaskId");
    const tasks = await listProjectTasks(user.id, projectId, {
      status: status.length ? status : undefined,
      assigneeId,
      milestoneId,
      parentTaskId: parentTaskId === "null" ? null : (parentTaskId ?? undefined),
    });
    return NextResponse.json({ tasks });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = createSchema.parse(await req.json());
    const task = await createTask(user.id, body.projectId, body);
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

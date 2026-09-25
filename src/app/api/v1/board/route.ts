import { NextResponse } from "next/server";
import { z } from "zod";
import { applyFilters, deriveColumns, moveTask, parseFilters } from "@/modules/board";
import { listProjectTasks } from "@/modules/tasks";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const groupBy = (url.searchParams.get("groupBy") ?? "status") as
      | "status"
      | "assignee"
      | "priority"
      | "milestone";
    if (!projectId) throw new AppError("缺少 projectId");
    const all = await listProjectTasks(user.id, projectId, { parentTaskId: null });
    const filtered = applyFilters(all, parseFilters(url.searchParams));
    return NextResponse.json({ columns: deriveColumns(filtered, groupBy) });
  } catch (e) {
    return jsonError(e);
  }
}

const moveSchema = z.object({
  taskId: z.string().min(1),
  status: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.string().optional(),
  milestoneId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = moveSchema.parse(await req.json());
    const { taskId, ...patch } = body;
    const task = await moveTask(user.id, taskId, patch);
    return NextResponse.json({ task });
  } catch (e) {
    return jsonError(e);
  }
}

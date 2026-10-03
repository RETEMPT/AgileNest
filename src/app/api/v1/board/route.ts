import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyFilters,
  deriveColumns,
  moveTask,
  movePatchSchema,
  parseFilters,
} from "@/modules/board";
import { listProjectTasks } from "@/modules/tasks";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const { projectId, groupBy } = z
      .object({
        projectId: z.uuid("请选择有效项目"),
        groupBy: z
          .enum(["status", "assignee", "priority", "milestone"])
          .default("status"),
      })
      .parse({
        projectId: url.searchParams.get("projectId"),
        groupBy: url.searchParams.get("groupBy") ?? undefined,
      });
    const all = await listProjectTasks(user.id, projectId, {
      parentTaskId: null,
    });
    const filtered = applyFilters(all, parseFilters(url.searchParams));
    return NextResponse.json({ columns: deriveColumns(filtered, groupBy) });
  } catch (e) {
    return jsonError(e);
  }
}

const moveSchema = movePatchSchema.extend({ taskId: z.uuid() });

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

import { NextResponse } from "next/server";
import {
  completionRatio,
  memberContribution,
  projectCompletion,
  taskHours,
} from "@/modules/worklog";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "project";
    const projectId = url.searchParams.get("projectId");
    const taskId = url.searchParams.get("taskId");
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    switch (view) {
      case "task": {
        if (!taskId) throw new AppError("缺少 taskId");
        return NextResponse.json({ completion: await completionRatio(user.id, taskId) });
      }
      case "project": {
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          completion: await projectCompletion(user.id, projectId),
        });
      }
      case "hours": {
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          hours: await taskHours(user.id, projectId, { from, to }),
        });
      }
      case "contribution": {
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          contribution: await memberContribution(user.id, projectId),
        });
      }
      default:
        throw new AppError("未知 view");
    }
  } catch (e) {
    return jsonError(e);
  }
}

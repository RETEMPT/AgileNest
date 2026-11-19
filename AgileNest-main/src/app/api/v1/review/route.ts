import { NextResponse } from "next/server";
import {
  listMyInProgress,
  listMyRejected,
  listMyTodo,
  listOverdueRisks,
  listPendingReview,
  listTaskEvents,
  listUnclaimedPool,
} from "@/modules/review";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const view = url.searchParams.get("view");
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const taskId = url.searchParams.get("taskId") ?? undefined;

    switch (view) {
      case "todo":
        return NextResponse.json({ tasks: await listMyTodo(user.id) });
      case "in_progress":
        return NextResponse.json({ tasks: await listMyInProgress(user.id) });
      case "rejected":
        return NextResponse.json({ tasks: await listMyRejected(user.id) });
      case "pool":
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          tasks: await listUnclaimedPool(user.id, projectId),
        });
      case "pending":
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          tasks: await listPendingReview(user.id, projectId),
        });
      case "overdue":
        if (!projectId) throw new AppError("缺少 projectId");
        return NextResponse.json({
          tasks: await listOverdueRisks(user.id, projectId),
        });
      case "events":
        if (!taskId) throw new AppError("缺少 taskId");
        return NextResponse.json({ events: await listTaskEvents(user.id, taskId) });
      default:
        throw new AppError("未知 view");
    }
  } catch (e) {
    return jsonError(e);
  }
}

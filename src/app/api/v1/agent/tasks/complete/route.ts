import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { authenticateApiToken } from "@/modules/identity";
import { moveTask } from "@/modules/board";
import { z } from "zod";

const agentCompleteSchema = z.object({
  taskId: z.uuid("任务 ID 必须为有效 UUID"),
  completionNote: z.string().trim().min(1, "完成说明不能为空").max(5000),
});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const auth = await authenticateApiToken(authHeader);
    if (!auth) {
      return NextResponse.json({ error: "未授权或令牌无效/已过期" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = agentCompleteSchema.parse(body);

    const task = await moveTask(auth.userId, parsed.taskId, {
      status: "in_progress",
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      taskId: parsed.taskId,
      note: parsed.completionNote,
      taskStatus: task?.status ?? "in_progress",
    });
  } catch (error) {
    return jsonError(error);
  }
}

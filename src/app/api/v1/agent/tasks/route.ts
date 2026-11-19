import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { authenticateApiToken } from "@/modules/identity";
import { createTask } from "@/modules/tasks";
import { z } from "zod";

const agentTaskCreateSchema = z.object({
  projectId: z.uuid("项目 ID 必须为有效 UUID"),
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题最多 200 字"),
  description: z.string().trim().max(10000).optional(),
  assigneeId: z.uuid().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  milestoneId: z.uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const auth = await authenticateApiToken(authHeader);
    if (!auth) {
      return NextResponse.json({ error: "未授权或令牌无效/已过期" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = agentTaskCreateSchema.parse(body);

    const task = await createTask(auth.userId, parsed.projectId, {
      title: parsed.title,
      description: parsed.description,
      assigneeId: parsed.assigneeId,
      startDate: parsed.startDate,
      dueDate: parsed.dueDate,
      priority: parsed.priority ?? "medium",
      milestoneId: parsed.milestoneId,
      acceptanceCriteria: [{ id: randomUUID(), text: "关键成果验证通过" }],
    });

    return NextResponse.json({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

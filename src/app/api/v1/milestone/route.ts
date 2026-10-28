import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  updateMilestone,
} from "@/modules/milestone";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["open_topic", "midterm", "final", "defense", "custom"]).optional(),
  targetDate: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) throw new AppError("缺少 projectId");
    return NextResponse.json({
      milestones: await listMilestones(user.id, projectId),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = createSchema.parse(await req.json());
    const milestone = await createMilestone(user.id, body.projectId, body);
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("缺少 id");
    const patch = await req.json();
    const milestone = await updateMilestone(user.id, id, patch);
    return NextResponse.json({ milestone });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError("缺少 id");
    await deleteMilestone(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

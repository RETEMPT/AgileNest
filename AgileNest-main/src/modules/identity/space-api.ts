import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { projectSpaceMutationSchema } from "./space-client";
import { getProjectDirectory, mutateProjectDirectory } from "./space-service";

type Context = { params: Promise<{ teamId: string }> };
export async function projectDirectoryGET(_request: Request, context: Context) {
  try { const actor = await requireApiUser(); const { teamId } = await context.params; z.uuid().parse(teamId); return NextResponse.json(await getProjectDirectory(actor.id, teamId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonError(error); }
}
export async function projectDirectoryPOST(request: Request, context: Context) {
  try {
    const actor = await requireApiUser(); const { teamId } = await context.params; z.uuid().parse(teamId);
    const body = await request.text(); if (body.length > 4096) throw new AppError("目录请求过大");
    let input: unknown; try { input = JSON.parse(body); } catch { throw new AppError("请求格式无效"); }
    await mutateProjectDirectory(actor.id, teamId, projectSpaceMutationSchema.parse(input));
    return NextResponse.json(await getProjectDirectory(actor.id, teamId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

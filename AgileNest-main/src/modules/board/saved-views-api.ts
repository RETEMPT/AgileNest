import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { savedTaskViewDeleteSchema, savedTaskViewInputSchema, savedTaskViewUpdateSchema } from "./saved-views-client";
import { createMyTaskView, deleteMyTaskView, listMyTaskViews, updateMyTaskView } from "./saved-views-service";

type ProjectContext = { params: Promise<{ projectId: string }> };
type ViewContext = { params: Promise<{ projectId: string; viewId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) { const response = jsonError(error); response.headers.set("Cache-Control", "private, no-store"); return response; }
function refreshViews(projectId: string) { for (const layout of ["tasks", "board", "table"]) revalidatePath(`/p/${projectId}/${layout}`); }

async function readInput(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new AppError("保存视图内容过大");
  if (!request.body) throw new AppError("请填写保存视图内容");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0; let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); throw new AppError("保存视图内容过大"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text) as unknown; } catch { throw new AppError("保存视图格式无效"); }
}

export async function taskViewsGET(_request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    return NextResponse.json(await listMyTaskViews(user.id, z.uuid().parse(projectId)), { headers });
  } catch (error) { return errorResponse(error); }
}

export async function taskViewsPOST(request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    const id = z.uuid().parse(projectId);
    const view = await createMyTaskView(user.id, id, savedTaskViewInputSchema.parse(await readInput(request)));
    refreshViews(id);
    return NextResponse.json(view, { status: 201, headers });
  } catch (error) { return errorResponse(error); }
}

export async function taskViewPATCH(request: Request, context: ViewContext) {
  try {
    const user = await requireApiUser();
    const { projectId, viewId } = await context.params;
    const id = z.uuid().parse(projectId);
    const view = await updateMyTaskView(user.id, id, z.uuid().parse(viewId), savedTaskViewUpdateSchema.parse(await readInput(request)));
    refreshViews(id);
    return NextResponse.json(view, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function taskViewDELETE(request: Request, context: ViewContext) {
  try {
    const user = await requireApiUser();
    const { projectId, viewId } = await context.params;
    const id = z.uuid().parse(projectId);
    await deleteMyTaskView(user.id, id, z.uuid().parse(viewId), savedTaskViewDeleteSchema.parse(await readInput(request)).version);
    refreshViews(id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error); }
}

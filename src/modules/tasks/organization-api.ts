import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { taskActionItemCreateSchema, taskLabelCreateSchema, taskLabelPatchSchema, taskOrganizationMutationSchema } from "./organization-client";
import { createTaskActionItem } from "./service";
import { changeTaskOrganization, createProjectTaskLabel, deleteProjectTaskLabel, getTaskOrganization, listProjectTaskLabels, updateProjectTaskLabel } from "./organization-service";

type TaskContext = { params: Promise<{ taskId: string }> };
type ProjectContext = { params: Promise<{ projectId: string }> };
type LabelContext = { params: Promise<{ projectId: string; labelId: string }> };
async function inputBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("请求格式无效");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 64000) { await reader.cancel(); throw new AppError("任务组织请求过大"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("请求格式无效"); }
}
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function taskOrganizationGET(request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    const query = z.string().max(100, "任务搜索最多 100 字").parse(new URL(request.url).searchParams.get("q") ?? "");
    return NextResponse.json(await getTaskOrganization(user.id, z.uuid().parse(taskId), query), { headers: privateHeaders });
  } catch (error) { return jsonError(error); }
}
export async function taskOrganizationPATCH(request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    return NextResponse.json(await changeTaskOrganization(user.id, z.uuid().parse(taskId), taskOrganizationMutationSchema.parse(await inputBody(request))));
  } catch (error) { return jsonError(error); }
}
export async function projectTaskLabelsGET(_request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    return NextResponse.json(await listProjectTaskLabels(user.id, z.uuid().parse(projectId)), { headers: privateHeaders });
  } catch (error) { return jsonError(error); }
}
export async function projectTaskLabelsPOST(request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    return NextResponse.json({ label: await createProjectTaskLabel(user.id, z.uuid().parse(projectId), taskLabelCreateSchema.parse(await inputBody(request))) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
export async function projectTaskLabelPATCH(request: Request, context: LabelContext) {
  try {
    const user = await requireApiUser();
    const { projectId, labelId } = await context.params;
    return NextResponse.json({ label: await updateProjectTaskLabel(user.id, z.uuid().parse(projectId), z.uuid().parse(labelId), taskLabelPatchSchema.parse(await inputBody(request))) });
  } catch (error) { return jsonError(error); }
}
export async function projectTaskLabelDELETE(request: Request, context: LabelContext) {
  try {
    const user = await requireApiUser();
    const { projectId, labelId } = await context.params;
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(await inputBody(request));
    await deleteProjectTaskLabel(user.id, z.uuid().parse(projectId), z.uuid().parse(labelId), version);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function taskActionItemPOST(request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    return NextResponse.json({ task: await createTaskActionItem(user.id, z.uuid().parse(projectId), taskActionItemCreateSchema.parse(await inputBody(request))) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

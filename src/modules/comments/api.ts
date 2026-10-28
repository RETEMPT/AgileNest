import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { projectCommentCreateSchema } from "./client";
import { projectCommentPatchSchema } from "./schema";
import { createProjectComment, listProjectComments, updateProjectComment, withdrawProjectComment } from "./service";

type ProjectContext = { params: Promise<{ projectId: string }> };
type CommentContext = { params: Promise<{ projectId: string; commentId: string }> };

async function jsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("请求格式无效");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 100000) { await reader.cancel(); throw new AppError("评论请求过大，请缩短正文"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("请求格式无效"); }
}

export async function projectCommentsGET(request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    z.uuid().parse(projectId);
    return NextResponse.json(await listProjectComments(user.id, projectId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function projectCommentsPOST(request: Request, context: ProjectContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    z.uuid().parse(projectId);
    const comment = await createProjectComment(user.id, projectId, projectCommentCreateSchema.parse(await jsonBody(request)));
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function projectCommentPATCH(request: Request, context: CommentContext) {
  try {
    const user = await requireApiUser();
    const { projectId, commentId } = await context.params;
    z.uuid().parse(projectId); z.uuid().parse(commentId);
    const input = projectCommentPatchSchema.parse(await jsonBody(request));
    const comment = input.op === "edit" ? await updateProjectComment(user.id, projectId, commentId, input)
      : await withdrawProjectComment(user.id, projectId, commentId, input.version);
    return NextResponse.json({ comment });
  } catch (error) { return jsonError(error); }
}

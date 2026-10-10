import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { discussionCreateSchema } from "./client";
import { discussionPatchSchema } from "./schema";
import { createTaskDiscussion, listDiscussionRevisions, listTaskDiscussions, setDiscussionResolved, updateTaskDiscussion, withdrawTaskDiscussion } from "./service";

type TaskContext = { params: Promise<{ taskId: string }> };
type PostContext = { params: Promise<{ taskId: string; postId: string }> };
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
      if (length > 100000) { await reader.cancel(); throw new AppError("讨论请求过大，请缩短正文"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("请求格式无效"); }
}

export async function taskDiscussionsGET(_request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    z.uuid().parse(taskId);
    return NextResponse.json(await listTaskDiscussions(user.id, taskId));
  } catch (error) { return jsonError(error); }
}
export async function taskDiscussionsPOST(request: Request, context: TaskContext) {
  try {
    const user = await requireApiUser();
    const { taskId } = await context.params;
    z.uuid().parse(taskId);
    const post = await createTaskDiscussion(user.id, taskId, discussionCreateSchema.parse(await jsonBody(request)));
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
export async function taskDiscussionGET(request: Request, context: PostContext) {
  try {
    const user = await requireApiUser();
    const { taskId, postId } = await context.params;
    z.uuid().parse(taskId); z.uuid().parse(postId);
    if (!new URL(request.url).searchParams.has("history")) throw new AppError("请使用 history 查询讨论历史");
    return NextResponse.json({ revisions: await listDiscussionRevisions(user.id, taskId, postId) });
  } catch (error) { return jsonError(error); }
}
export async function taskDiscussionPATCH(request: Request, context: PostContext) {
  try {
    const user = await requireApiUser();
    const { taskId, postId } = await context.params;
    z.uuid().parse(taskId); z.uuid().parse(postId);
    const input = discussionPatchSchema.parse(await jsonBody(request));
    const post = input.op === "edit" ? await updateTaskDiscussion(user.id, taskId, postId, input)
      : input.op === "withdraw" ? await withdrawTaskDiscussion(user.id, taskId, postId, input.version)
      : await setDiscussionResolved(user.id, taskId, postId, input);
    return NextResponse.json({ post });
  } catch (error) { return jsonError(error); }
}

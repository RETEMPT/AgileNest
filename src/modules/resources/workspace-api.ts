import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/modules/core";
import { jsonError, requireApiUser } from "@/lib/api";
import { getResource } from "./service";
import { collaborationSchema, commentInputSchema, commentPatchSchema, folderInputSchema, folderPatchSchema, placementSchema, resourceLinkSchema } from "./schema";
import { createResourceComment, createResourceFolder, getResourceCollaboration, getResourceWorkspace, linkResource, listResourceCommentHistory, listResourceComments, listResourceLinks, listTaskResourceLinks, placeResource, setResourceCollaboration, unlinkResource, updateResourceComment, updateResourceFolder } from "./workspace-service";

const privateHeaders = { "Cache-Control": "private, no-store" };
async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new AppError("请求格式无效"); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; length += item.value.length; if (length > 100000) { await reader.cancel(); throw new AppError("协作请求过大"); } chunks.push(item.value); } } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new AppError("请求格式无效"); }
}
export async function resourceWorkspaceGET(request: Request) {
  try {
    const actor = await requireApiUser(); const q = new URL(request.url).searchParams;
    if (q.get("resourceId")) { const id = z.uuid().parse(q.get("resourceId")); const resource = await getResource(actor.id, id); return NextResponse.json({ resource, links: await listResourceLinks(actor.id, id), comments: await listResourceComments(actor.id, id), collaboration: await getResourceCollaboration(actor.id, id) }, { headers: privateHeaders }); }
    if (q.get("taskId")) return NextResponse.json(await listTaskResourceLinks(actor.id, z.uuid().parse(q.get("taskId"))), { headers: privateHeaders });
    if (q.get("commentId")) return NextResponse.json({ revisions: await listResourceCommentHistory(actor.id, z.uuid().parse(q.get("commentId"))) }, { headers: privateHeaders });
    const scope = z.object({ teamId: z.uuid().optional(), projectId: z.uuid().optional() }).parse({ teamId: q.get("teamId") || undefined, projectId: q.get("projectId") || undefined });
    return NextResponse.json(await getResourceWorkspace(actor.id, scope), { headers: privateHeaders });
  } catch (e) { return jsonError(e); }
}
export async function resourceWorkspacePOST(request: Request) {
  try {
    const actor = await requireApiUser(); const input = z.object({ op: z.enum(["folder.create", "folder.update", "resource.place", "link.create", "link.remove", "collaboration.update", "comment.create", "comment.update"]), data: z.unknown() }).parse(await readBody(request));
    switch (input.op) {
      case "folder.create": return NextResponse.json({ folder: await createResourceFolder(actor.id, folderInputSchema.parse(input.data)) }, { status: 201, headers: privateHeaders });
      case "folder.update": return NextResponse.json({ folder: await updateResourceFolder(actor.id, folderPatchSchema.parse(input.data)) }, { headers: privateHeaders });
      case "resource.place": return NextResponse.json({ resource: await placeResource(actor.id, placementSchema.parse(input.data)) }, { headers: privateHeaders });
      case "link.create": return NextResponse.json(await linkResource(actor.id, resourceLinkSchema.parse(input.data)), { status: 201, headers: privateHeaders });
      case "link.remove": { const { linkId } = z.object({ linkId: z.uuid() }).parse(input.data); await unlinkResource(actor.id, linkId); return NextResponse.json({ ok: true }, { headers: privateHeaders }); }
      case "collaboration.update": return NextResponse.json({ collaboration: await setResourceCollaboration(actor.id, collaborationSchema.parse(input.data)) }, { headers: privateHeaders });
      case "comment.create": return NextResponse.json({ comment: await createResourceComment(actor.id, commentInputSchema.parse(input.data)) }, { status: 201, headers: privateHeaders });
      case "comment.update": return NextResponse.json({ comment: await updateResourceComment(actor.id, commentPatchSchema.parse(input.data)) }, { headers: privateHeaders });
    }
  } catch (e) { return jsonError(e); }
}

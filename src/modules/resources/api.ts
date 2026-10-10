import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/modules/core";
import { jsonError, requireApiUser } from "@/lib/api";
import { createResource, deleteResource, getResource, getResourceFile, listResourceRevisions, listResources, updateResource, uploadResource } from "./service";
import { resourceInputSchema, resourcePatchSchema } from "./schema";
import { RESOURCE_MAX_BYTES } from "./client";

type Context = { params: Promise<{ resourceId: string }> };
async function jsonBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("请求格式无效");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.length;
      if (length > 1500000) { await reader.cancel(); throw new AppError("文档请求过大"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text) as unknown; } catch { throw new AppError("请求格式无效"); }
}
export async function resourcesGET(request: Request) {
  try { const user = await requireApiUser(); const q = new URL(request.url).searchParams; return NextResponse.json({ resources: await listResources(user.id, { teamId: q.get("teamId") || undefined, projectId: q.get("projectId") || undefined }) }); }
  catch (e) { return jsonError(e); }
}
export async function resourcesPOST(request: Request) {
  try {
    const user = await requireApiUser();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const reader = request.body?.getReader();
      if (!reader) throw new AppError("请添加文件");
      const chunks: Uint8Array[] = []; let length = 0;
      try { for (;;) { const item = await reader.read(); if (item.done) break; length += item.value.length; if (length > RESOURCE_MAX_BYTES + 65536) { await reader.cancel(); throw new AppError("上传请求超过 10 MB 限制"); } chunks.push(item.value); } } finally { reader.releaseLock(); }
      const body = Buffer.concat(chunks);
      const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("请选择文件");
      const scope = { teamId: typeof form.get("teamId") === "string" ? String(form.get("teamId")) : undefined, projectId: typeof form.get("projectId") === "string" ? String(form.get("projectId")) : undefined };
      const resource = await uploadResource(user.id, scope, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, String(form.get("title") ?? ""));
      return NextResponse.json({ resource }, { status: 201 });
    }
    return NextResponse.json({ resource: await createResource(user.id, resourceInputSchema.parse(await jsonBody(request))) }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
export async function resourceGET(request: Request, context: Context) {
  try { const user = await requireApiUser(); const { resourceId } = await context.params; z.uuid().parse(resourceId); if (new URL(request.url).searchParams.has("history")) return NextResponse.json({ revisions: await listResourceRevisions(user.id, resourceId) }); return NextResponse.json({ resource: await getResource(user.id, resourceId) }); }
  catch (e) { return jsonError(e); }
}
export async function resourcePATCH(request: Request, context: Context) {
  try { const user = await requireApiUser(); const { resourceId } = await context.params; z.uuid().parse(resourceId); return NextResponse.json({ resource: await updateResource(user.id, resourceId, resourcePatchSchema.parse(await jsonBody(request))) }); }
  catch (e) { return jsonError(e); }
}
export async function resourceDELETE(request: Request, context: Context) {
  try { const user = await requireApiUser(); const { resourceId } = await context.params; z.uuid().parse(resourceId); const { version } = z.object({ version: z.number().int().min(1) }).parse(await jsonBody(request)); await deleteResource(user.id, resourceId, version); return NextResponse.json({ ok: true }); }
  catch (e) { return jsonError(e); }
}
export async function resourceFileGET(request: Request, context: Context) {
  try {
    const user = await requireApiUser(); const { resourceId } = await context.params; z.uuid().parse(resourceId);
    const { resource, bytes } = await getResourceFile(user.id, resourceId);
    const previewable = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain|text\/markdown)$/.test(resource.mimeType ?? "");
    const download = new URL(request.url).searchParams.has("download") || !previewable;
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": resource.mimeType ?? "application/octet-stream", "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(resource.fileName ?? resource.title)}`, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
  } catch (e) { return jsonError(e); }
}

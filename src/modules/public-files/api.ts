import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/modules/core";
import { jsonError, requireApiUser } from "@/lib/api";
import { PUBLIC_FILE_MAX_BYTES } from "./client";
import { deletePublicFile, getPublicFile, listPublicFiles, uploadPublicFile } from "./service";

type FileContext = { params: Promise<{ fileId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function publicFilesGET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ files: await listPublicFiles(user.id) }, { headers: privateHeaders });
  } catch (e) { return jsonError(e); }
}

export async function publicFilesPOST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) throw new AppError("请选择文件");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("请添加文件");
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > PUBLIC_FILE_MAX_BYTES + 65536) { await reader.cancel(); throw new AppError("上传请求超过 10 MB 限制"); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("请选择文件");
    const uploaded = await uploadPublicFile(user.id, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return NextResponse.json({ file: uploaded }, { status: 201 });
  } catch (e) { return jsonError(e); }
}

export async function publicFileGET(request: Request, context: FileContext) {
  try {
    const user = await requireApiUser();
    const { fileId } = await context.params;
    z.uuid().parse(fileId);
    const { file, bytes } = await getPublicFile(user.id, fileId);
    const previewable = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain|text\/markdown)$/.test(file.mimeType);
    const download = new URL(request.url).searchParams.has("download") || !previewable;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) { return jsonError(e); }
}

export async function publicFileDELETE(_req: Request, context: FileContext) {
  try {
    const user = await requireApiUser();
    const { fileId } = await context.params;
    z.uuid().parse(fileId);
    await deletePublicFile(user.id, fileId);
    return NextResponse.json({ ok: true });
  } catch (e) { return jsonError(e); }
}

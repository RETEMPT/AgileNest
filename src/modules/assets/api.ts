import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { assetCreateSchema, assetRequestCreateSchema, assetUpdateSchema } from "./client";
import { assetRequestPatchSchema } from "./schema";
import { createAsset, createAssetRequest, decideAssetRequest, deleteAsset, listAssetRequests, listAssets, returnAssetRequest, updateAsset, withdrawAssetRequest } from "./service";

type TeamContext = { params: Promise<{ teamId: string }> };
type AssetContext = { params: Promise<{ teamId: string; assetId: string }> };
type RequestContext = { params: Promise<{ teamId: string; requestId: string }> };

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
      if (length > 100000) { await reader.cancel(); throw new AppError("资源请求过大，请缩短内容"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("请求格式无效"); }
}

export async function assetsGET(request: Request, context: TeamContext) {
  try {
    const user = await requireApiUser();
    const { teamId } = await context.params;
    z.uuid().parse(teamId);
    return NextResponse.json(await listAssets(user.id, teamId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function assetsPOST(request: Request, context: TeamContext) {
  try {
    const user = await requireApiUser();
    const { teamId } = await context.params;
    z.uuid().parse(teamId);
    const asset = await createAsset(user.id, teamId, assetCreateSchema.parse(await jsonBody(request)));
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function assetPATCH(request: Request, context: AssetContext) {
  try {
    const user = await requireApiUser();
    const { teamId, assetId } = await context.params;
    z.uuid().parse(teamId); z.uuid().parse(assetId);
    const asset = await updateAsset(user.id, teamId, assetId, assetUpdateSchema.parse(await jsonBody(request)));
    return NextResponse.json({ asset });
  } catch (error) { return jsonError(error); }
}

export async function assetDELETE(request: Request, context: AssetContext) {
  try {
    const user = await requireApiUser();
    const { teamId, assetId } = await context.params;
    z.uuid().parse(teamId); z.uuid().parse(assetId);
    const version = Number(new URL(request.url).searchParams.get("version"));
    await deleteAsset(user.id, teamId, assetId, version);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function assetRequestsGET(request: Request, context: TeamContext) {
  try {
    const user = await requireApiUser();
    const { teamId } = await context.params;
    z.uuid().parse(teamId);
    return NextResponse.json(await listAssetRequests(user.id, teamId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function assetRequestsPOST(request: Request, context: TeamContext) {
  try {
    const user = await requireApiUser();
    const { teamId } = await context.params;
    z.uuid().parse(teamId);
    const result = await createAssetRequest(user.id, teamId, assetRequestCreateSchema.parse(await jsonBody(request)));
    return NextResponse.json({ request: result }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function assetRequestPATCH(request: Request, context: RequestContext) {
  try {
    const user = await requireApiUser();
    const { teamId, requestId } = await context.params;
    z.uuid().parse(teamId); z.uuid().parse(requestId);
    const input = assetRequestPatchSchema.parse(await jsonBody(request));
    const result = input.op === "withdraw" ? await withdrawAssetRequest(user.id, teamId, requestId, input.version)
      : input.op === "decide" ? await decideAssetRequest(user.id, teamId, requestId, { version: input.version, decision: input.decision })
      : await returnAssetRequest(user.id, teamId, requestId, input.version);
    return NextResponse.json({ request: result });
  } catch (error) { return jsonError(error); }
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { createDeliveryBatch, exportDeliveryRecord, getDeliveryBatch, getProjectDeliveries, mutateDeliveryBatch } from "./service";
import { deliveryBatchCreateSchema, deliveryMutationSchema } from "./client";

type ProjectContext = { params: Promise<{ projectId: string }> };
type BatchContext = { params: Promise<{ batchId: string }> };
const uuid = z.uuid("交付或项目无效");
function refresh(projectId: string) { revalidatePath(`/p/${projectId}/delivery`); revalidatePath(`/p/${projectId}`); }

export async function projectDeliveriesGET(_request: Request, context: ProjectContext) {
  try { const actor = await requireApiUser(); const { projectId } = await context.params; return NextResponse.json(await getProjectDeliveries(actor.id, uuid.parse(projectId)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
export async function projectDeliveriesPOST(request: Request, context: ProjectContext) {
  try { const actor = await requireApiUser(); const { projectId } = await context.params; const { requestKey, ...input } = deliveryBatchCreateSchema.parse(await request.json()); const id = await createDeliveryBatch(actor.id, uuid.parse(projectId), input, requestKey); refresh(projectId); return NextResponse.json({ id }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}
export async function deliveryBatchGET(_request: Request, context: BatchContext) {
  try { const actor = await requireApiUser(); const { batchId } = await context.params; return NextResponse.json(await getDeliveryBatch(actor.id, uuid.parse(batchId)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
export async function deliveryBatchPATCH(request: Request, context: BatchContext) {
  try { const actor = await requireApiUser(); const { batchId } = await context.params; const batch = await mutateDeliveryBatch(actor.id, uuid.parse(batchId), deliveryMutationSchema.parse(await request.json())); refresh(batch.projectId); return NextResponse.json(batch); }
  catch (error) { return jsonError(error); }
}
export async function deliveryExportGET(request: Request, context: BatchContext) {
  try {
    const actor = await requireApiUser(); const { batchId } = await context.params; const params = new URL(request.url).searchParams;
    const version = z.coerce.number().int().positive("请选择记录版本").parse(params.get("version"));
    const format = z.enum(["markdown", "json"]).parse(params.get("format") ?? "markdown");
    const result = await exportDeliveryRecord(actor.id, uuid.parse(batchId), version, format);
    return new NextResponse(result.body, { headers: { "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${result.fileName}"`, "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

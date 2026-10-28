import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { ACCOUNT_CHANGED_MESSAGE } from "@/components/account-context";
import { chatRequestSchema, modelConfigurationInputSchema, planRequestSchema } from "./client";
import { MODEL_COOKIE_NAME } from "./credentials";
import { chatWithModel, listModelNames, planWithModel, testModelConnection } from "./service";
import { applyTaskPlan, applyTaskPlanInputSchema } from "./adoption";
import { planAssistRequestSchema } from "./client";
import { assistTaskPlan } from "./service";
import { activeModelSummary, changeModelProvider, listModelProviders, saveModelProvider } from "./providers";
import { extractFileContent } from "@/modules/resources";
import { changePluginLibrary, discoverMcpTools, getPluginLibrary, requireBuiltinPlugin, savePluginLibrary } from "./plugins";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    const response = json({ error: error.message }, error.status);
    if (error.status === 409 && error.message === ACCOUNT_CHANGED_MESSAGE) response.headers.set("X-AgileNest-Account-Changed", "1");
    return response;
  }
  if (error instanceof ZodError) return json({ error: error.issues.map((issue) => issue.message).join("；") || "请求参数无效" }, 400);
  return json({ error: "模型服务暂时无法使用，请稍后重试" }, 500);
}
export function requireModelRequestOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("请从当前网站页面发起请求", 403);
}
export async function readModelRequestBody(request: Request, optional = false): Promise<unknown> {
  if (!request.body) {
    if (optional) return undefined;
    throw new AppError("请填写请求内容");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new AppError("请求需要使用 JSON 格式");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > 600000) { await reader.cancel(); throw new AppError("请求内容过大，请减少资料后重试", 413); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  if (optional && !text.trim()) return undefined;
  try { return JSON.parse(text) as unknown; } catch { throw new AppError("请求内容不是有效的 JSON"); }
}
const cookie = (request: NextRequest) => request.cookies.get(MODEL_COOKIE_NAME)?.value;
export async function modelExtractFilePOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request); const user = await requireApiUser(); await requireBuiltinPlugin(user.id, "office-reader");
    const maximum = 10 * 1024 * 1024;
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximum + 65536) throw new AppError("附件不能超过 10 MB", 413);
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) throw new AppError("请使用文件上传格式");
    if (!request.body) throw new AppError("请选择需要读取的文件");
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        if (request.signal.aborted) throw new AppError("已停止读取文件", 499);
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > maximum + 65536) { await reader.cancel(); throw new AppError("附件不能超过 10 MB", 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const formRequest = new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: Buffer.concat(chunks) });
    let form: FormData;
    try { form = await formRequest.formData(); } catch { throw new AppError("上传内容无效，请重新选择文件"); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File) || [...form.keys()].some((name) => name !== "file")) throw new AppError("每次请选择一份文件");
    const file = files[0];
    if (!file.size || file.size > maximum) throw new AppError("文件需大于 0 字节且不超过 10 MB", 413);
    return json(await extractFileContent({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { signal: request.signal }));
  } catch (error) { return errorResponse(error); }
}
export async function modelPluginsGET() {
  try { const user = await requireApiUser(); return json(await getPluginLibrary(user.id)); } catch (error) { return errorResponse(error); }
}
export async function modelPluginsPUT(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); return json(await savePluginLibrary(user.id, await readModelRequestBody(request))); } catch (error) { return errorResponse(error); }
}
export async function modelPluginsPATCH(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); return json(await changePluginLibrary(user.id, await readModelRequestBody(request))); } catch (error) { return errorResponse(error); }
}
export async function modelPluginsDiscoverPOST(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); return json(await discoverMcpTools(user.id, await readModelRequestBody(request), request.signal)); } catch (error) { return errorResponse(error); }
}
export async function modelConfigGET(request: NextRequest) {
  try { const user = await requireApiUser(); return json(await activeModelSummary(user.id, cookie(request))); }
  catch (error) { return errorResponse(error); }
}
export async function modelConfigPUT(request: NextRequest) {
  try { requireModelRequestOrigin(request); await requireApiUser(); throw new AppError("请前往模型配置页面管理服务提供商", 410); }
  catch (error) { return errorResponse(error); }
}
export const modelConfigDELETE = modelConfigPUT;
function clearLegacyCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(MODEL_COOKIE_NAME, "", { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/api/v1/ai", maxAge: 0 });
  return response;
}
export async function modelProvidersGET(request: NextRequest) {
  try { const user = await requireApiUser(); return clearLegacyCookie(json(await listModelProviders(user.id, cookie(request))), request); }
  catch (error) { return errorResponse(error); }
}
export async function modelProvidersPUT(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); return clearLegacyCookie(json(await saveModelProvider(user.id, await readModelRequestBody(request), cookie(request))), request); }
  catch (error) { return errorResponse(error); }
}
export async function modelProvidersPATCH(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); return clearLegacyCookie(json(await changeModelProvider(user.id, await readModelRequestBody(request), cookie(request))), request); }
  catch (error) { return errorResponse(error); }
}
export async function modelTestPOST(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); const input = z.object({ providerId: z.uuid().optional() }).strict().parse(await readModelRequestBody(request, true) ?? {}); return json(await testModelConnection(user.id, cookie(request), request.signal, input.providerId)); }
  catch (error) { return errorResponse(error); }
}
export async function modelChatPOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request); const user = await requireApiUser(); const input = chatRequestSchema.parse(await readModelRequestBody(request));
    if (request.nextUrl.searchParams.get("stream") !== "1" && !request.headers.get("accept")?.includes("application/x-ndjson")) return json(await chatWithModel(user.id, cookie(request), input, request.signal));
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(target) {
        const send = (event: unknown) => { if (!signal.aborted) target.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
        try { const result = await chatWithModel(user.id, cookie(request), input, signal, send); send({ type: "result", ...result }); }
        catch (error) { send({ type: "error", error: error instanceof AppError ? error.message : "模型服务暂时无法使用，请稍后重试" }); }
        finally { if (!signal.aborted) target.close(); }
      },
      cancel() { controller.abort(); },
    });
    return new NextResponse(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
  }
  catch (error) { return errorResponse(error); }
}
export async function modelPlanPOST(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); const input = planRequestSchema.parse(await readModelRequestBody(request)); return json(await planWithModel(user.id, cookie(request), input, request.signal)); }
  catch (error) { return errorResponse(error); }
}
export async function modelAssistPOST(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); const input = planAssistRequestSchema.parse(await readModelRequestBody(request)); return json(await assistTaskPlan(user.id, cookie(request), input, request.signal)); }
  catch (error) { return errorResponse(error); }
}
export async function modelApplyPlanPOST(request: NextRequest) {
  try { requireModelRequestOrigin(request); const user = await requireApiUser(); const input = applyTaskPlanInputSchema.parse(await readModelRequestBody(request)); return json(await applyTaskPlan(user.id, input)); }
  catch (error) { return errorResponse(error); }
}
const modelDiscoveryInputSchema = modelConfigurationInputSchema.extend({ model: z.string().max(120).default("") });
export async function modelNamesPOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request); const user = await requireApiUser();
    const raw = await readModelRequestBody(request, true);
    const selected = z.object({ providerId: z.uuid(), configuration: modelDiscoveryInputSchema.optional() }).strict();
    const parsed = raw && typeof raw === "object" && "providerId" in raw ? selected.parse(raw) : undefined;
    return json(await listModelNames(user.id, cookie(request), parsed ? parsed.configuration : raw === undefined ? undefined : modelDiscoveryInputSchema.parse(raw), request.signal, parsed?.providerId));
  } catch (error) { return errorResponse(error); }
}

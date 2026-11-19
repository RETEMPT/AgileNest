import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP, type LookupFunction } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { AppError } from "@/modules/core";

const MAX_RESPONSE_BYTES = 1024 * 1024;
export function isPublicModelAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99) || a === 100 && b >= 64 && b <= 127 || a === 168 && b === 63 && c === 129 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      if (isIP(mapped) === 4) return isPublicModelAddress(mapped);
      const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
      if (match) { const high = parseInt(match[1], 16); const low = parseInt(match[2], 16); return isPublicModelAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`); }
    }
    const words = normalized.split(":"); const first = Number.parseInt(words[0], 16); const second = Number.parseInt(words[1] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  return false;
}
function allowedLocalOrigin(origin: string): boolean {
  return (process.env.AI_ALLOWED_LOCAL_ORIGINS ?? "").split(",").some((entry) => {
    try {
      const trimmed = entry.trim().replace(/^["']|["']$/g, "");
      if (!trimmed) return false;
      const value = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      return value.origin === origin && !value.username && !value.password && !value.search && !value.hash;
    } catch { return false; }
  });
}
export function normalizeModelBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError("API 地址无效，请填写完整的 HTTPS 地址"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new AppError("API 地址只能使用 HTTP 或 HTTPS，且不能包含账号、密码、查询参数或锚点");
  const allowed = allowedLocalOrigin(url.origin);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowed && (url.protocol !== "https:" || /(^|\.)(localhost|local|internal|home\.arpa)$/.test(hostname) || hostname === "metadata.google.internal" || isIP(hostname) && !isPublicModelAddress(hostname))) throw new AppError("请使用公网 HTTPS 模型地址；校内或本机模型需由服务器管理员允许该地址");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}
export function modelEndpoint(baseUrl: string, endpoint: "chat/completions" | "responses" | "messages" | "models") {
  const base = normalizeModelBaseUrl(baseUrl);
  const url = new URL(base);
  if (/\/(chat\/completions|responses|messages|models)$/.test(url.pathname)) throw new AppError("API 地址请填写服务根地址或 /v1，不要包含具体接口路径");
  return new URL(`${base}${url.pathname === "/" || url.pathname === "" ? "/v1" : ""}/${endpoint}`);
}
function cancelled(signal: AbortSignal) {
  return signal.reason instanceof AppError ? signal.reason : new AppError("模型请求已取消", 499);
}
async function resolveModelTarget(url: URL, signal: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const permittedLocal = allowedLocalOrigin(url.origin);
  if (signal.aborted) throw cancelled(signal);
  const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(cancelled(signal));
    signal.addEventListener("abort", abort, { once: true });
    lookup(hostname, { all: true, verbatim: true }).then(resolve, () => reject(new AppError("模型地址暂时无法解析，请检查 API 地址", 502))).finally(() => signal.removeEventListener("abort", abort));
  });
  if (signal.aborted) throw cancelled(signal);
  if (!records.length) throw new AppError("模型地址未解析到可连接的地址，请检查服务器 DNS", 502);
  if (!permittedLocal && records.some((record) => !isPublicModelAddress(record.address))) {
    const fakeDns = records.some((record) => /^198\.(18|19)\./.test(record.address));
    throw new AppError(fakeDns ? `服务器 DNS 将此地址解析为代理虚拟地址（198.18.0.0/15）。请调整代理 DNS，或由服务器管理员在 AI_ALLOWED_LOCAL_ORIGINS 中明确允许 ${url.origin}` : `模型地址解析到了内网或保留地址。校内服务请由服务器管理员在 AI_ALLOWED_LOCAL_ORIGINS 中明确允许 ${url.origin}`, 400);
  }
  return records.toSorted((a, b) => a.family - b.family);
}
function upstreamError(status: number): AppError {
  if (status >= 300 && status < 400) return new AppError("模型接口返回了跳转，请直接填写最终 API 地址", 502);
  if (status === 401 || status === 403) return new AppError("模型服务拒绝授权，请检查密钥、模型访问权限和 API 地址", 400);
  if (status === 404) return new AppError("模型或接口不存在，请检查模型名称、API 地址和接口类型", 400);
  if (status === 429) return new AppError("模型服务额度不足或请求过多，请检查账户额度并稍后重试", 429);
  if (status === 400 || status === 422) return new AppError("模型服务不接受当前参数，请检查模型名称、接口类型和推理设置", 400);
  return new AppError("模型服务暂时不可用，请稍后重试", 502);
}
export async function requestModelJson(url: URL, headers: Record<string, string>, body: unknown | undefined, timeoutSeconds: number, signal?: AbortSignal): Promise<unknown> {
  normalizeModelBaseUrl(url.toString());
  const controller = new AbortController();
  const abort = () => controller.abort(new AppError("模型请求已取消", 499));
  const timer = setTimeout(() => controller.abort(new AppError("模型响应超时，请稍后重试或增加超时时间", 504)), timeoutSeconds * 1000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const records = await resolveModelTarget(url, controller.signal);
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, records);
      else callback(null, records[0].address, records[0].family);
    };
    return await new Promise<unknown>((resolve, reject) => {
      const encoded = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: encoded ? "POST" : "GET", headers: { ...headers, Accept: "application/json", ...(encoded ? { "Content-Type": "application/json", "Content-Length": String(encoded.length) } : {}) },
        lookup: pinnedLookup, ...{ autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 }, agent: false, signal: controller.signal,
      }, (response) => {
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) { response.destroy(); reject(upstreamError(status)); return; }
        if (Number(response.headers["content-length"]) > MAX_RESPONSE_BYTES) { response.destroy(); reject(new AppError("模型响应过大，请减少输出长度", 502)); return; }
        const chunks: Buffer[] = []; let size = 0; let ended = false;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) { response.destroy(); reject(new AppError("模型响应过大，请减少输出长度", 502)); }
          else chunks.push(chunk);
        });
        response.on("end", () => {
          ended = true;
          if (response.complete === false) { reject(new AppError("模型响应中途断开，请重试", 502)); return; }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown); }
          catch { reject(new AppError("模型服务返回了无法识别的内容，请检查 API 地址和接口类型", 502)); }
        });
        response.on("error", () => reject(controller.signal.aborted ? cancelled(controller.signal) : new AppError("读取模型响应失败，请重试", 502)));
        response.on("close", () => { if (!ended) reject(controller.signal.aborted ? cancelled(controller.signal) : new AppError("模型响应中途断开，请重试", 502)); });
      });
      request.on("error", () => reject(controller.signal.aborted ? cancelled(controller.signal) : new AppError("无法连接模型服务，请检查 API 地址、网络或证书", 502)));
      request.end(encoded);
    });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export async function requestMcpHttp(url: URL, headers: Record<string, string>, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ value: unknown; sessionId?: string }> {
  normalizeModelBaseUrl(url.toString());
  const controller = new AbortController();
  const abort = () => controller.abort(new AppError("MCP请求已取消", 499));
  const timer = setTimeout(() => controller.abort(new AppError("MCP服务响应超时", 504)), 30000);
  signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  try {
    const records = await resolveModelTarget(url, controller.signal);
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => { if (options.all) callback(null, records); else callback(null, records[0].address, records[0].family); };
    return await new Promise((resolve, reject) => {
      const encoded = Buffer.from(JSON.stringify(body));
      let done = false;
      const fail = (error: AppError) => { if (!done) { done = true; reject(error); } };
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method: "POST", headers: { ...headers, Accept: "application/json, text/event-stream", "Content-Type": "application/json", "Content-Length": String(encoded.length) }, lookup: pinnedLookup, ...{ autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 }, agent: false, signal: controller.signal }, (response) => {
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) { response.destroy(); fail(new AppError(status === 401 || status === 403 ? "MCP服务拒绝授权，请检查连接凭据" : status === 429 ? "MCP服务请求过多，请稍后重试" : "MCP服务请求失败，请检查最终连接地址与服务状态", status === 429 ? 429 : 502)); return; }
        const rawSession = response.headers["mcp-session-id"];
        const sessionId = typeof rawSession === "string" && /^[\x21-\x7e]{1,256}$/.test(rawSession) ? rawSession : undefined;
        const succeed = (value: unknown) => { if (!done) { done = true; resolve({ value, sessionId }); } };
        if (body.id === undefined && status === 202) { succeed(undefined); response.destroy(); return; }
        const isSse = response.headers["content-type"]?.includes("text/event-stream");
        if (!isSse && !response.headers["content-type"]?.includes("application/json")) { response.destroy(); fail(new AppError("MCP服务未返回JSON或SSE内容", 502)); return; }
        let total = 0; let sse = ""; const chunks: Buffer[] = []; const decoder = new StringDecoder("utf8");
        const parseFrame = (frame: string) => {
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data) return;
          let value: unknown; try { value = JSON.parse(data); } catch { return; }
          if (value && typeof value === "object" && "id" in value && value.id === body.id) { succeed(value); response.destroy(); }
        };
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_RESPONSE_BYTES) { response.destroy(); fail(new AppError("MCP响应超过读取上限", 502)); return; }
          if (isSse) {
            sse = (sse + decoder.write(chunk)).replace(/\r\n/g, "\n"); let at: number;
            while ((at = sse.indexOf("\n\n")) >= 0) { const frame = sse.slice(0, at); sse = sse.slice(at + 2); parseFrame(frame); }
          } else chunks.push(chunk);
        });
        response.on("end", () => {
          if (done) return;
          if (isSse) { parseFrame(sse + decoder.end()); if (!done) fail(new AppError("MCP服务没有返回对应请求的结果", 502)); return; }
          if (body.id === undefined && !total) { succeed(undefined); return; }
          try { succeed(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown); } catch { fail(new AppError("MCP返回内容无法识别", 502)); }
        });
        response.on("error", () => fail(controller.signal.aborted ? new AppError("MCP请求已停止或超时", 499) : new AppError("MCP响应中断", 502)));
        response.on("close", () => { if (!done) fail(new AppError("MCP连接提前关闭", 502)); });
      });
      request.on("error", () => fail(controller.signal.aborted ? controller.signal.reason instanceof AppError ? controller.signal.reason : new AppError("MCP请求已停止", 499) : new AppError("无法连接MCP服务，请检查地址、网络与证书", 502)));
      request.end(encoded);
    });
  } catch (error) {
    if (error instanceof AppError) throw new AppError(error.message.replace(/模型/g, "MCP"), error.status);
    throw new AppError("MCP服务暂时无法连接", 502);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

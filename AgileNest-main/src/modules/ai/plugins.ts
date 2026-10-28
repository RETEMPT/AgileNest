import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { AppError, ConflictError, NotFoundError } from "@/modules/core";
import { builtinCatalog, mcpToolSchema, pluginActionSchema, pluginLibrarySchema, pluginSaveSchema, type BuiltinId, type PluginLibrary } from "./plugins-client";
import { normalizeModelBaseUrl, requestMcpHttp } from "./transport";

const storedToolSchema = mcpToolSchema.extend({ fingerprint: z.string() });
const serverSchema = pluginLibrarySchema.shape.mcpServers.element.omit({ hasToken: true }).extend({ token: z.string().max(2048), tools: z.array(storedToolSchema).max(100) });
const storeSchema = z.object({ version: z.literal(1), actorId: z.string().min(1), revision: z.number().int().nonnegative(), builtins: pluginLibrarySchema.shape.builtins, mcpServers: z.array(serverSchema).max(8) }).strict();
type Store = z.infer<typeof storeSchema>;
type Server = Store["mcpServers"][number];
function empty(actorId: string): Store { return { version: 1, actorId, revision: 0, builtins: builtinCatalog.map(({ id }) => ({ id, enabled: true })), mcpServers: [] }; }
function filename(actorId: string) { return path.join(path.resolve(process.env.AI_PLUGIN_STORE_DIR || path.join(process.cwd(), ".data", "ai-plugins")), `${createHash("sha256").update(actorId).digest("hex")}.enc`); }
function key() { const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET; if (!secret) throw new AppError("服务器未配置登录密钥，无法保存插件", 503); return createHash("sha256").update("agilenest:plugins:v1\0").update(secret).digest(); }
function summary(store: Store): PluginLibrary { return { revision: store.revision, builtins: store.builtins, mcpServers: store.mcpServers.map(({ token, tools, ...server }) => ({ ...server, tools: tools.map(({ fingerprint, ...tool }) => { void fingerprint; return tool; }), hasToken: !!token })) }; }
async function readStore(actorId: string): Promise<Store> {
  const target = filename(actorId);
  let bytes: Buffer;
  // Account configuration is runtime state and must never be traced into a build.
  try { bytes = await readFile(/* turbopackIgnore: true */ target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty(actorId); throw new AppError("插件配置暂时无法读取", 503); }
  try {
    if (bytes.length < 29 || bytes.length > 8 * 1024 * 1024) throw new Error("length");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12)); decipher.setAAD(Buffer.from(`agilenest:plugins:${actorId}`)); decipher.setAuthTag(bytes.subarray(12, 28));
    const store = storeSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
    if (store.actorId !== actorId || new Set(store.builtins.map((item) => item.id)).size !== store.builtins.length || new Set(store.mcpServers.map((item) => item.id)).size !== store.mcpServers.length) throw new Error("owner");
    return store;
  } catch { throw new AppError("插件配置损坏或无法解密，请检查服务器登录密钥与配置备份", 503); }
}
async function writeStore(store: Store) {
  const target = filename(store.actorId); const temporary = `${target}.${randomUUID()}.tmp`;
  const plaintext = JSON.stringify(storeSchema.parse(store));
  if (Buffer.byteLength(plaintext, "utf8") > 8 * 1024 * 1024 - 28) throw new AppError("插件工具目录过大，请减少连接或工具数量");
  try {
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv); cipher.setAAD(Buffer.from(`agilenest:plugins:${store.actorId}`));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const handle = await open(temporary, "wx", 0o600); try { await handle.writeFile(Buffer.concat([iv, cipher.getAuthTag(), ciphertext])); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } catch { await unlink(temporary).catch(() => {}); throw new AppError("无法安全保存插件配置，请检查存储权限", 503); }
}
async function mutate(actorId: string, expectedRevision: number, change: (store: Store) => void) {
  const target = filename(actorId); await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 40; attempt++) { try { handle = await open(`${target}.lock`, "wx", 0o600); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new AppError("插件存储不可写", 503); await delay(50); } }
  if (!handle) throw new ConflictError("插件正在保存，请稍后刷新重试");
  try { const store = await readStore(actorId); if (store.revision !== expectedRevision) throw new ConflictError("插件配置已变化，请刷新后重试"); change(store); store.revision++; await writeStore(store); return summary(store); }
  finally { await handle.close(); await unlink(`${target}.lock`).catch(() => {}); }
}
function requireServer(store: Store, id: string) { const server = store.mcpServers.find((item) => item.id === id); if (!server) throw new NotFoundError("MCP连接不存在"); return server; }
export async function getPluginLibrary(actorId: string) { return summary(await readStore(actorId)); }
export async function assertBuiltinEnabled(actorId: string, id: BuiltinId) { if (!(await readStore(actorId)).builtins.find((item) => item.id === id)?.enabled) throw new AppError("此功能已在插件库中关闭，请先启用", 409); }
export const requireBuiltinPlugin = assertBuiltinEnabled;
export async function savePluginLibrary(actorId: string, raw: unknown) {
  const input = pluginSaveSchema.parse(raw);
  return mutate(actorId, input.expectedRevision, (store) => {
    if (input.builtins) { if (new Set(input.builtins.map((item) => item.id)).size !== input.builtins.length) throw new AppError("插件设置重复"); for (const item of input.builtins) { const current = store.builtins.find((row) => row.id === item.id); if (current) current.enabled = item.enabled; } }
    if (input.server) {
      const value = input.server; normalizeModelBaseUrl(value.url); const url = new URL(value.url).toString(); const current = value.id ? requireServer(store, value.id) : undefined;
      if (!current && store.mcpServers.length >= 8) throw new AppError("最多保存8个MCP连接");
      const sameUrl = current?.url === url;
      const server: Server = { id: current?.id ?? randomUUID(), name: value.name, url, token: value.token ?? (sameUrl ? current.token : ""), enabled: value.enabled ?? (sameUrl ? current.enabled : false), tools: sameUrl ? current.tools : [] };
      store.mcpServers = current ? store.mcpServers.map((item) => item.id === server.id ? server : item) : [...store.mcpServers, server];
    }
  });
}
export async function changePluginLibrary(actorId: string, raw: unknown) {
  const input = pluginActionSchema.parse(raw);
  return mutate(actorId, input.expectedRevision, (store) => {
    const server = requireServer(store, input.serverId);
    if (input.op === "delete-server") { store.mcpServers = store.mcpServers.filter((item) => item.id !== server.id); return; }
    if (input.enabled === undefined) throw new AppError("请选择启用状态");
    if (input.op === "toggle-server") server.enabled = input.enabled;
    else {
      const tool = server.tools.find((item) => item.name === input.toolName); if (!tool) throw new NotFoundError("此MCP工具尚未发现，请刷新工具列表");
      if (input.enabled && !tool.readOnly) throw new AppError("此工具未声明只读，不允许在聊天中自动调用", 403);
      tool.enabled = input.enabled;
    }
  });
}
async function session(server: Server, signal?: AbortSignal) {
  const authorization: Record<string, string> = server.token ? { Authorization: `Bearer ${server.token}` } : {};
  const initialize = await requestMcpHttp(new URL(server.url), authorization, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "AgileCampus", version: "1" } } }, signal);
  const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.literal(1), result: z.object({ protocolVersion: z.enum(["2025-03-26", "2025-06-18"]) }).passthrough() }).safeParse(initialize.value);
  if (!envelope.success) throw new AppError("MCP初始化失败，仅支持2025-03-26或2025-06-18 Streamable HTTP协议", 502);
  const headers: Record<string, string> = { ...authorization, "MCP-Protocol-Version": envelope.data.result.protocolVersion, ...(initialize.sessionId ? { "Mcp-Session-Id": initialize.sessionId } : {}) };
  await requestMcpHttp(new URL(server.url), headers, { jsonrpc: "2.0", method: "notifications/initialized" }, signal);
  return async (id: number, method: string, params: unknown) => {
    const response = await requestMcpHttp(new URL(server.url), headers, { jsonrpc: "2.0", id, method, params }, signal);
    const value = z.object({ jsonrpc: z.literal("2.0"), id: z.number(), result: z.unknown().optional(), error: z.unknown().optional() }).safeParse(response.value);
    if (!value.success || value.data.id !== id || value.data.error || value.data.result === undefined) throw new AppError("MCP工具请求未成功，请检查服务端工具状态", 502);
    return value.data.result;
  };
}
export async function discoverMcpTools(actorId: string, raw: unknown, signal?: AbortSignal) {
  const input = z.object({ serverId: z.uuid(), expectedRevision: z.number().int().nonnegative().optional() }).strict().parse(raw);
  const store = await readStore(actorId); const server = requireServer(store, input.serverId);
  if (input.expectedRevision !== undefined && input.expectedRevision !== store.revision) throw new ConflictError("插件配置已变化，请刷新后重试");
  const rpc = await session(server, signal); const tools: Server["tools"] = []; let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const result = z.object({ tools: z.array(z.object({ name: z.string().min(1).max(128), description: z.string().max(2000).optional(), inputSchema: z.record(z.string(), z.unknown()), annotations: z.object({ readOnlyHint: z.boolean().optional() }).passthrough().optional() }).passthrough()).max(100), nextCursor: z.string().max(2000).optional() }).parse(await rpc(2 + page, "tools/list", cursor ? { cursor } : {}));
    for (const tool of result.tools) {
      if (tools.length >= 100 || tools.some((item) => item.name === tool.name) || JSON.stringify(tool.inputSchema).length > 8192) throw new AppError("MCP工具目录过大或存在重复工具，请缩小服务范围", 502);
      const previous = server.tools.find((item) => item.name === tool.name);
      const readOnly = tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true;
      const fingerprint = createHash("sha256").update(JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations })).digest("hex");
      tools.push({ ...mcpToolSchema.parse({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema, readOnly, enabled: readOnly && previous?.readOnly && previous.enabled && previous.fingerprint === fingerprint || false }), fingerprint });
    }
    cursor = result.nextCursor; if (!cursor) break;
  }
  if (cursor) throw new AppError("MCP工具目录分页超过读取上限，请缩小服务范围", 502);
  return mutate(actorId, store.revision, (current) => { requireServer(current, server.id).tools = tools; });
}
export async function callMcpTool(actorId: string, serverId: string, toolName: string, args: Record<string, unknown>, signal?: AbortSignal) {
  let entries = 0;
  const inspect = (value: unknown, depth: number) => { if (depth > 8 || ++entries > 1000) throw new AppError("MCP工具参数层级过深或字段过多"); if (value && typeof value === "object") for (const item of Object.values(value)) inspect(item, depth + 1); };
  inspect(args, 0);
  if (JSON.stringify(args).length > 12000) throw new AppError("MCP工具参数过长");
  const store = await readStore(actorId); const server = requireServer(store, serverId); const tool = server.tools.find((item) => item.name === toolName);
  if (!server.enabled || !tool?.enabled || !tool.readOnly) throw new AppError("此MCP连接或只读工具尚未启用", 403);
  const rpc = await session(server, signal);
  // Initialization can wait on a remote server; revocation must be checked again before tools/call.
  const current = await readStore(actorId); const now = requireServer(current, serverId); const nowTool = now.tools.find((item) => item.name === toolName);
  if (current.revision !== store.revision || !now.enabled || !nowTool?.enabled || !nowTool.readOnly) throw new ConflictError("MCP工具设置已变化，请重试");
  const result = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).max(100).optional(), isError: z.boolean().optional(), structuredContent: z.unknown().optional() }).passthrough().parse(await rpc(5, "tools/call", { name: toolName, arguments: args }));
  if (result.isError) throw new AppError("MCP工具未能完成读取，请检查服务端状态", 502);
  const rawText = (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n") || (result.structuredContent ? JSON.stringify(result.structuredContent) : "");
  const full = server.token ? rawText.split(server.token).join("[已隐藏连接凭据]") : rawText;
  if (!full.trim()) throw new AppError("MCP工具没有返回文字结果；图片或音频需由工具转换为文字", 502);
  if ((await readStore(actorId)).revision !== current.revision) throw new ConflictError("MCP工具设置已变化，未返回本次工具结果");
  return { serverId, serverName: server.name, toolName, text: full.slice(0, 8000), truncated: full.length > 8000, revision: current.revision };
}

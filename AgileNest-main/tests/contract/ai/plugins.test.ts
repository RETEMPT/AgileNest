import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { callMcpTool, changePluginLibrary, discoverMcpTools, getPluginLibrary, requireBuiltinPlugin, savePluginLibrary } from "@/modules/ai/plugins";
import { requestMcpHttp } from "@/modules/ai/transport";
vi.mock("@/modules/ai/transport", async (original) => ({ ...await original<typeof import("@/modules/ai/transport")>(), requestMcpHttp: vi.fn() }));
const transport = vi.mocked(requestMcpHttp);
let directory: string;
let tools: { name: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> }[];
beforeEach(async () => {
  vi.clearAllMocks(); directory = await mkdtemp(path.join(tmpdir(), "agilenest-plugin-contract-")); vi.stubEnv("AI_PLUGIN_STORE_DIR", directory); vi.stubEnv("AUTH_SECRET", "plugin-fixture-secret");
  tools = [{ name: "read_text", description: "读取文字", inputSchema: { type: "object", properties: { query: { type: "string" } } }, annotations: { readOnlyHint: true } }, { name: "delete_file", description: "删除", inputSchema: { type: "object" } }];
  transport.mockImplementation(async (_url, _headers, body) => ({ sessionId: "fixture-session", value: body.method === "initialize" ? { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } } : body.method === "tools/list" ? { jsonrpc: "2.0", id: body.id, result: { tools } } : body.method === "tools/call" ? { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "提取出的真实文字" }, { type: "image", data: "ignored" }] } } : undefined }));
});
afterEach(async () => { vi.unstubAllEnvs(); if (!path.basename(directory).startsWith("agilenest-plugin-contract-")) throw new Error("Unexpected test directory"); await rm(directory, { recursive: true, force: true }); });
async function prepared() {
  let library = await savePluginLibrary("alice", { expectedRevision: 0, server: { name: "文档读取", url: "https://mcp.example.com/mcp/", token: "mcp-fixture-private-key" } });
  const id = library.mcpServers[0].id;
  library = await discoverMcpTools("alice", { serverId: id });
  return { library, id };
}
async function enabled() {
  const preparedServer = await prepared(); const id = preparedServer.id; let library = preparedServer.library;
  library = await changePluginLibrary("alice", { expectedRevision: library.revision, op: "toggle-server", serverId: id, enabled: true });
  library = await changePluginLibrary("alice", { expectedRevision: library.revision, op: "toggle-tool", serverId: id, toolName: "read_text", enabled: true });
  return { library, id };
}
describe("按账号加密插件设置与真实只读执行守卫", () => {
  it("默认9项内置启用且无外部连接，关闭实际守卫拒绝执行", async () => {
    const initial = await getPluginLibrary("alice"); expect(initial.builtins).toHaveLength(9); expect(initial.builtins.every((item) => item.enabled)).toBe(true); expect(initial.mcpServers).toEqual([]);
    await savePluginLibrary("alice", { expectedRevision: 0, builtins: [{ id: "office-reader", enabled: false }] });
    await expect(requireBuiltinPlugin("alice", "office-reader")).rejects.toMatchObject({ status: 409 }); await expect(requireBuiltinPlugin("bob", "office-reader")).resolves.toBeUndefined();
  });
  it("密钥只存在独立加密文件，摘要无token且账号隔离", async () => {
    const { library } = await prepared();
    expect(JSON.stringify(library)).not.toContain("mcp-fixture-private-key"); expect(library.mcpServers[0].hasToken).toBe(true); expect((await getPluginLibrary("bob")).mcpServers).toEqual([]);
    const files = await readdir(directory); expect(files).toHaveLength(1); expect((await readFile(path.join(directory, files[0]))).toString()).not.toContain("mcp-fixture-private-key");
  });
  it("拒绝旧版本保存并保留严格MCP路径，不继承换地址凭据", async () => {
    const { library, id } = await prepared();
    expect(library.mcpServers[0].url).toBe("https://mcp.example.com/mcp/");
    await expect(savePluginLibrary("alice", { expectedRevision: 0, builtins: [] })).rejects.toMatchObject({ status: 409 });
    const next = await savePluginLibrary("alice", { expectedRevision: library.revision, server: { id, name: "新服务", url: "https://other.example.com/mcp" } });
    expect(next.mcpServers[0]).toMatchObject({ hasToken: false, enabled: false, tools: [] });
  });
  it("真实发现initialize/initialized/list会话，工具默认关闭且不能开启未声明只读工具", async () => {
    const { library, id } = await prepared(); expect(transport.mock.calls.map((call) => call[2].method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(transport.mock.calls[1][1]).toMatchObject({ "Mcp-Session-Id": "fixture-session", "MCP-Protocol-Version": "2025-06-18", Authorization: "Bearer mcp-fixture-private-key" });
    expect(library.mcpServers[0].tools.every((tool) => !tool.enabled)).toBe(true);
    await expect(changePluginLibrary("alice", { expectedRevision: library.revision, op: "toggle-tool", serverId: id, toolName: "delete_file", enabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(callMcpTool("alice", id, "read_text", {})).rejects.toMatchObject({ status: 403 });
  });
  it("只调用已启用只读工具，图片块不被伪造为模型视觉能力", async () => {
    const { id } = await enabled();
    const result = await callMcpTool("alice", id, "read_text", { query: "课程" });
    expect(result).toMatchObject({ toolName: "read_text", text: "提取出的真实文字", truncated: false });
    expect(transport.mock.calls.at(-1)?.[2]).toMatchObject({ method: "tools/call", params: { name: "read_text", arguments: { query: "课程" } } });
    expect(JSON.stringify(transport.mock.calls)).not.toContain("model-provider-key");
  });
  it("重发现说明、schema或annotations变化撤回原工具授权", async () => {
    const { id } = await enabled();
    tools[0].annotations = { readOnlyHint: true, title: "能力已变化" };
    const library = await discoverMcpTools("alice", { serverId: id });
    expect(library.mcpServers[0].tools[0].enabled).toBe(false);
  });
  it("初始化期间撤回开关会在tools/call前重新拦截", async () => {
    const { id, library } = await enabled(); const implementation = transport.getMockImplementation()!;
    transport.mockImplementationOnce(async (...args) => { await changePluginLibrary("alice", { expectedRevision: library.revision, op: "toggle-server", serverId: id, enabled: false }); return implementation(...args); });
    await expect(callMcpTool("alice", id, "read_text", {})).rejects.toMatchObject({ status: 409 });
    expect(transport.mock.calls.some((call) => call[2].method === "tools/call")).toBe(false);
  });
  it("参数有大小与深度限制，拒绝任意服务器和越权账号调用", async () => {
    const { id } = await enabled();
    await expect(callMcpTool("bob", id, "read_text", {})).rejects.toMatchObject({ status: 404 });
    await expect(callMcpTool("alice", id, "read_text", { text: "x".repeat(12001) })).rejects.toThrow("参数过长");
    let nested: Record<string, unknown> = {}; for (let i = 0; i < 10; i++) nested = { child: nested };
    await expect(callMcpTool("alice", id, "read_text", nested)).rejects.toThrow("层级过深");
  });
});

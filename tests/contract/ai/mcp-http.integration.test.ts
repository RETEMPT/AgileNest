import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { requestMcpHttp } from "@/modules/ai/transport";
let server: Server;
let url: URL;
let mode: "json" | "sse" | "redirect" | "hold" = "json";
let bodies: Record<string, unknown>[];
let closed = false;
beforeEach(async () => {
  bodies = []; mode = "json"; closed = false;
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>; bodies.push(body);
    if (mode === "redirect") { response.writeHead(302, { Location: "https://example.com/never-follow" }); response.end(); return; }
    if (mode === "hold") { response.on("close", () => { closed = true; }); return; }
    if (body.id === undefined) { response.writeHead(202); response.end(); return; }
    const result = { jsonrpc: "2.0", id: body.id, result: { text: "课程总结与验收要求" } };
    if (mode === "sse") {
      response.writeHead(200, { "content-type": "text/event-stream", "Mcp-Session-Id": "native-session" });
      response.write('event: message\r\ndata: {"jsonrpc":"2.0","method":"server/ignored"}\r\n\r\n');
      const data = Buffer.from(`event: message\r\ndata: ${JSON.stringify(result)}\r\n\r\n`);
      const split = data.indexOf(Buffer.from("课")) + 1;
      response.write(data.subarray(0, split)); setImmediate(() => { response.write(data.subarray(split)); response.end(); });
    } else { response.writeHead(200, { "content-type": "application/json", "Mcp-Session-Id": "native-session" }); response.end(JSON.stringify(result)); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture did not start");
  url = new URL(`http://127.0.0.1:${address.port}/mcp/`); vi.stubEnv("AI_ALLOWED_LOCAL_ORIGINS", url.origin);
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); vi.unstubAllEnvs(); });
describe("MCP Streamable HTTP真实本机网络夹具", () => {
  it("POST JSON保留完整MCP路径和会话，不拼模型v1端点", async () => {
    const result = await requestMcpHttp(url, { Authorization: "Bearer virtual-mcp-key" }, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(result).toMatchObject({ sessionId: "native-session", value: { id: 1, result: { text: "课程总结与验收要求" } } }); expect(bodies).toHaveLength(1);
  });
  it("SSE忽略反向请求/通知，只取对应ID且跨字节中文完整", async () => {
    mode = "sse";
    const result = await requestMcpHttp(url, { "Mcp-Session-Id": "native-session", "MCP-Protocol-Version": "2025-06-18" }, { jsonrpc: "2.0", id: 5, method: "tools/call" });
    expect(result.value).toMatchObject({ id: 5, result: { text: "课程总结与验收要求" } }); expect(bodies).toHaveLength(1);
  });
  it("initialized通知接受空202", async () => {
    expect(await requestMcpHttp(url, {}, { jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({ value: undefined, sessionId: undefined });
  });
  it("不跟随跳转，不把远端错误正文暴露给浏览器", async () => {
    mode = "redirect";
    await expect(requestMcpHttp(url, {}, { jsonrpc: "2.0", id: 1, method: "initialize" })).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining("never-follow") }); expect(bodies).toHaveLength(1);
  });
  it("撤销本地网络允许后拒绝连接，未改变SSRF边界", async () => {
    vi.stubEnv("AI_ALLOWED_LOCAL_ORIGINS", "");
    await expect(requestMcpHttp(url, {}, { jsonrpc: "2.0", id: 1, method: "initialize" })).rejects.toThrow(); expect(bodies).toHaveLength(0);
  });
  it("取消关闭已经发出的真实socket", async () => {
    mode = "hold"; const controller = new AbortController();
    const pending = requestMcpHttp(url, {}, { jsonrpc: "2.0", id: 1, method: "initialize" }, controller.signal).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
    try { await vi.waitFor(() => expect(bodies).toHaveLength(1)); } finally { controller.abort(); }
    expect(await pending).toMatchObject({ ok: false, error: { status: 499 } }); await vi.waitFor(() => expect(closed).toBe(true));
  });
});

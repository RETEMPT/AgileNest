import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chatWithModel, listModelNames, planWithModel, saveModelConfiguration, testModelConnection } from "@/modules/ai/service";
import type { ModelConfiguration, TaskPlan } from "@/modules/ai/client";

const access = vi.hoisted(() => ({ project: vi.fn() }));
vi.mock("@/modules/core", async (original) => ({ ...await original<typeof import("@/modules/core")>(), requireProjectForUser: access.project }));

type CapturedRequest = { method: string; path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> };
type FixtureMode = "text" | "plan" | "unauthorized" | "hold";
const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
const fixtureKey = "fixture-key-not-a-real-provider-secret";
const fixtureText = "本机 HTTP 协议测试夹具的文本样本";
const fixturePlan: TaskPlan = { version: 1, nodes: [
  { id: "research", title: "整理调研资料", criteria: ["形成可查阅的调研记录"], parentId: null, dependsOn: [] },
  { id: "report", title: "完成报告", criteria: ["报告引用调研结论并可演示"], parentId: null, dependsOn: ["research"] },
] };
let server: Server;
let origin: string;
let mode: FixtureMode = "text";
let requests: CapturedRequest[] = [];
let heldResponseClosed = false;

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      const path = request.url ?? "";
      requests.push({ method: request.method ?? "", path, headers: request.headers, body });
      if (mode === "unauthorized") { send(response, 401, { error: { message: `untrusted-upstream-details:${fixtureKey}` } }); return; }
      const authorized = path === "/v1/messages" ? request.headers["x-api-key"] === fixtureKey && request.headers["anthropic-version"] === "2023-06-01" : request.headers.authorization === `Bearer ${fixtureKey}`;
      if (!authorized) { send(response, 401, { error: { message: "fixture authorization mismatch" } }); return; }
      if (path === "/v1/models" && request.method === "GET") {
        send(response, 200, { data: [{ id: "fixture-model" }, { id: "fixture-alternative" }, { id: "fixture-model" }] }); return;
      }
      if (request.method !== "POST" || body.model !== "fixture-model" || body.stream !== false) { send(response, 422, { error: { message: "fixture request fields mismatch" } }); return; }
      if (mode === "hold") { response.on("close", () => { heldResponseClosed = true; }); return; }
      const text = mode === "plan" ? JSON.stringify(fixturePlan) : fixtureText;
      if (path === "/v1/chat/completions" && Array.isArray(body.messages) && (body.max_tokens === 4096 || body.max_completion_tokens === 4096)) {
        send(response, 200, { choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] }); return;
      }
      if (path === "/v1/responses" && Array.isArray(body.input) && body.max_output_tokens === 4096 && typeof body.instructions === "string") {
        send(response, 200, { status: "completed", output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text }] }] }); return;
      }
      if (path === "/v1/messages" && Array.isArray(body.messages) && body.max_tokens === 4096 && typeof body.system === "string") {
        send(response, 200, { content: [{ type: "thinking", thinking: "fixture hidden reasoning" }, { type: "text", text }], stop_reason: "end_turn" }); return;
      }
      send(response, 422, { error: { message: "fixture protocol mismatch" } });
    } catch { if (!response.destroyed) send(response, 500, { error: { message: "fixture could not read request" } }); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  vi.clearAllMocks(); requests = []; mode = "text"; heldResponseClosed = false;
  vi.stubEnv("AUTH_SECRET", "local-http-fixture-encryption-secret");
  vi.stubEnv("AI_ALLOWED_LOCAL_ORIGINS", origin);
  access.project.mockResolvedValue({ project: { id: projectId } });
});
afterEach(() => { server.closeAllConnections(); vi.unstubAllEnvs(); });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

function configuration(protocol: ModelConfiguration["protocol"] = "chat"): ModelConfiguration {
  return { name: "仅用于本机协议测试的连接", provider: protocol === "anthropic" ? "anthropic" : protocol === "responses" ? "openai" : "compatible", baseUrl: origin, model: "fixture-model", protocol, timeoutSeconds: 10, maxOutputTokens: 4096 };
}
function saved(protocol: ModelConfiguration["protocol"] = "chat") {
  return saveModelConfiguration("alice", { ...configuration(protocol), apiKey: fixtureKey }, undefined).cookie;
}

describe("本机 HTTP 夹具验证真实 socket 模型协议（不连接外部模型）", () => {
  it.each([
    ["chat", "/v1/chat/completions"], ["responses", "/v1/responses"], ["anthropic", "/v1/messages"],
  ] as const)("%s 连接测试真实发包并正确读取文本", async (protocol, path) => {
    const result = await testModelConnection("alice", saved(protocol));
    expect(result).toMatchObject({ text: fixtureText, model: "fixture-model" }); expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ method: "POST", path, body: { model: "fixture-model", stream: false } });
    expect(requests[0].headers["content-type"]).toBe("application/json");
    if (protocol === "anthropic") {
      expect(requests[0].headers["x-api-key"]).toBe(fixtureKey); expect(requests[0].headers.authorization).toBeUndefined();
      expect(requests[0].body).toMatchObject({ max_tokens: 4096, system: expect.any(String), messages: [{ role: "user", content: "请只回复：连接成功。" }] });
    } else {
      expect(requests[0].headers.authorization).toBe(`Bearer ${fixtureKey}`); expect(requests[0].headers["x-api-key"]).toBeUndefined();
      if (protocol === "responses") expect(requests[0].body).toMatchObject({ max_output_tokens: 4096, store: false, input: [{ role: "user", content: "请只回复：连接成功。" }] });
      else expect(requests[0].body).toMatchObject({ max_tokens: 4096, messages: [expect.objectContaining({ role: "system" }), { role: "user", content: "请只回复：连接成功。" }] });
    }
  });
  it("项目对话经过 ACL 后把指定消息历史发到真实 HTTP 连接", async () => {
    const messages = [{ role: "user" as const, content: "先查阅我选中的资料摘要" }, { role: "assistant" as const, content: "上一轮夹具记录" }, { role: "user" as const, content: "按摘要说明工作顺序" }];
    expect(await chatWithModel("alice", saved(), { projectId, knowledgeScope: "none", messages })).toMatchObject({ text: fixtureText, model: "fixture-model", sources: [], workSources: [], retrieval: { scope: "none" } });
    expect(access.project).toHaveBeenCalledWith("alice", projectId);
    expect(requests[0].body.messages).toEqual([expect.objectContaining({ role: "system" }), ...messages]);
  });
  it("规划读取真实 HTTP 返回的 JSON 并校验为可采纳结构", async () => {
    mode = "plan";
    expect(await planWithModel("alice", saved("responses"), { projectId, goal: "根据课程要求先调研再交报告" })).toEqual({ plan: fixturePlan, model: "fixture-model" });
    expect(access.project).toHaveBeenCalledWith("alice", projectId);
    expect(requests[0]).toMatchObject({ path: "/v1/responses", body: { input: [{ role: "user", content: "根据课程要求先调研再交报告" }] } });
  });
  it("模型列表通过真实 GET 请求取得，支持尚未保存模型名称", async () => {
    expect(await listModelNames("alice", undefined, { ...configuration(), model: "", apiKey: fixtureKey })).toEqual({ models: ["fixture-alternative", "fixture-model"] });
    expect(await listModelNames("alice", saved())).toEqual({ models: ["fixture-alternative", "fixture-model"] });
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).toMatchObject({ method: "GET", path: "/v1/models", body: {}, headers: { authorization: `Bearer ${fixtureKey}` } });
  });
  it("真实 HTTP 401 仅给出中文处理建议，不透出上游正文", async () => {
    mode = "unauthorized";
    const error: unknown = await testModelConnection("alice", saved()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 400, message: "模型服务拒绝授权，请检查密钥、模型访问权限和 API 地址" });
    expect(String(error)).not.toContain(fixtureKey); expect(String(error)).not.toContain("untrusted-upstream-details");
    expect(requests).toHaveLength(1);
  });
  it("取消会关闭已经发出的真实 HTTP 请求", async () => {
    mode = "hold"; const controller = new AbortController();
    const task = chatWithModel("alice", saved(), { messages: [{ role: "user", content: "取消这次夹具请求" }] }, controller.signal);
    const checked = expect(task).rejects.toMatchObject({ status: 499, message: "已停止本次回答" });
    await vi.waitFor(() => expect(requests).toHaveLength(1)); controller.abort();
    await checked; await vi.waitFor(() => expect(heldResponseClosed).toBe(true));
  });
  it("移除精确地址许可后不会连接本机夹具", () => {
    vi.stubEnv("AI_ALLOWED_LOCAL_ORIGINS", "");
    expect(() => saved()).toThrow("校内或本机模型需由服务器管理员允许该地址");
    expect(requests).toHaveLength(0);
  });
});

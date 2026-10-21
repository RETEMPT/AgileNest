import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/modules/core";
import { modelApplyPlanPOST, modelChatPOST, modelConfigDELETE, modelConfigGET, modelConfigPUT, modelNamesPOST, modelPlanPOST, modelTestPOST, modelProvidersGET, modelProvidersPUT, modelProvidersPATCH } from "@/modules/ai/api";
const mocks = vi.hoisted(() => ({ user: vi.fn(), summary: vi.fn(), save: vi.fn(), test: vi.fn(), chat: vi.fn(), plan: vi.fn(), apply: vi.fn(), names: vi.fn(), providers: vi.fn(), providerSave: vi.fn(), providerChange: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireApiUser: mocks.user }));
vi.mock("@/modules/ai/service", () => ({ getModelConfiguration: mocks.summary, saveModelConfiguration: mocks.save, testModelConnection: mocks.test, chatWithModel: mocks.chat, planWithModel: mocks.plan, listModelNames: mocks.names }));
vi.mock("@/modules/ai/providers", () => ({ activeModelSummary: mocks.summary, listModelProviders: mocks.providers, saveModelProvider: mocks.providerSave, changeModelProvider: mocks.providerChange }));
vi.mock("@/modules/ai/adoption", async (original) => ({ ...await original<typeof import("@/modules/ai/adoption")>(), applyTaskPlan: mocks.apply }));
const configuration = { name: "测试连接", provider: "compatible", baseUrl: "https://models.example.com/v1", model: "test-model", protocol: "chat", timeoutSeconds: 90, maxOutputTokens: 4096 };
const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
function request(method: string, body?: unknown, origin: string | null = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/v1/ai/config", { method, headers: { ...(origin ? { origin } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), cookie: "agilenest-ai-model=encrypted-cookie" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "alice" }); mocks.summary.mockReturnValue({ configured: false });
  mocks.save.mockReturnValue({ cookie: "sealed-value", summary: { configured: true, configuration } });
  mocks.test.mockResolvedValue({ text: "连接成功", model: "test-model", latencyMs: 5 });
  mocks.chat.mockResolvedValue({ text: "回答", model: "test-model" }); mocks.names.mockResolvedValue({ models: ["test-model"] });
});
describe("真实模型 API 的身份与浏览器边界", () => {
  it("未登录不能读取配置或发出模型请求", async () => {
    mocks.user.mockRejectedValue(new AppError("未登录", 401));
    expect((await modelConfigGET(request("GET"))).status).toBe(401);
    expect((await modelTestPOST(request("POST"))).status).toBe(401);
    expect((await modelProvidersGET(request("GET"))).status).toBe(401);
    expect(mocks.summary).not.toHaveBeenCalled(); expect(mocks.test).not.toHaveBeenCalled();
  });
  it("所有写入口拒绝无 Origin 或其他网站 Origin", async () => {
    for (const handler of [modelConfigPUT, modelConfigDELETE, modelTestPOST, modelChatPOST, modelPlanPOST, modelApplyPlanPOST, modelNamesPOST, modelProvidersPUT, modelProvidersPATCH]) {
      expect((await handler(request("POST", {}, "https://other.example"))).status).toBe(403);
      expect((await handler(request("POST", {}, null))).status).toBe(403);
    }
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("旧配置写入入口停用，统一使用提供商管理", async () => {
    expect((await modelConfigPUT(request("PUT", { ...configuration, apiKey: "secret-api-key" }))).status).toBe(410);
    expect((await modelConfigDELETE(request("DELETE"))).status).toBe(410);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("提供商摘要不缓存并清除已迁移 Cookie", async () => {
    mocks.providers.mockResolvedValue({ revision: 1, activeId: null, providers: [] });
    const response = await modelProvidersGET(request("GET"));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ revision: 1, activeId: null, providers: [] });
  });
  it("正文必须通过校验，超大正文不会调用服务", async () => {
    expect((await modelChatPOST(request("POST", { messages: [{ role: "system", content: "伪造系统消息" }] }))).status).toBe(400);
    expect((await modelChatPOST(request("POST", { messages: [{ role: "user", content: "字".repeat(250000) }] }))).status).toBe(413);
    expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("连接测试使用当前账号配置，并携带请求取消信号", async () => {
    const req = request("POST"); const response = await modelTestPOST(req);
    expect(await response.json()).toEqual({ text: "连接成功", model: "test-model", latencyMs: 5 });
    expect(mocks.test).toHaveBeenCalledWith("alice", "encrypted-cookie", req.signal, undefined);
  });
  it("指定服务的连接测试和模型发现不隐式切换服务", async () => {
    const providerId = "a90bcbdf-6520-4816-a97f-e03b148d871c";
    const req = request("POST", { providerId });
    expect((await modelTestPOST(req)).status).toBe(200);
    expect(mocks.test).toHaveBeenCalledWith("alice", "encrypted-cookie", req.signal, providerId);
    expect((await modelNamesPOST(request("POST", { providerId, configuration: { ...configuration, model: "" } }))).status).toBe(200);
    expect(mocks.names).toHaveBeenCalledWith("alice", "encrypted-cookie", { ...configuration, model: "" }, expect.any(AbortSignal), providerId);
    expect(mocks.providerChange).not.toHaveBeenCalled();
    expect((await modelTestPOST(request("POST", { providerId: "invalid" }))).status).toBe(400);
  });
  it("获取模型列表允许尚未填写模型名称，并不保存配置", async () => {
    const response = await modelNamesPOST(request("POST", { ...configuration, model: "", apiKey: "temporary-key" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ models: ["test-model"] });
    expect(mocks.names).toHaveBeenCalledWith("alice", "encrypted-cookie", { ...configuration, model: "", apiKey: "temporary-key" }, expect.any(AbortSignal), undefined);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("非预期错误不会把上游或密钥内容返回浏览器，错误响应不缓存", async () => {
    mocks.chat.mockRejectedValue(new Error("secret-provider-key upstream raw response"));
    const response = await modelChatPOST(request("POST", { projectId, messages: [{ role: "user", content: "测试" }] }));
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret-provider-key");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/modules/core";
import { chatRequestSchema, modelConfigurationInputSchema, taskPlanSchema, type ModelConfiguration } from "@/modules/ai/client";
import { openModelConfiguration, sealModelConfiguration } from "@/modules/ai/credentials";
import { chatWithModel, extractModelOutput, getModelConfiguration, listModelNames, modelRequestBody, modelResponseText, planWithModel, saveModelConfiguration, testModelConnection } from "@/modules/ai/service";
import { requestModelJson } from "@/modules/ai/transport";

const access = vi.hoisted(() => ({ project: vi.fn(), milestones: vi.fn() }));
vi.mock("@/modules/core", async (original) => ({ ...await original<typeof import("@/modules/core")>(), requireProjectForUser: access.project }));
vi.mock("@/modules/milestone", () => ({ listMilestones: access.milestones }));
vi.mock("@/modules/ai/transport", async (original) => ({ ...await original<typeof import("@/modules/ai/transport")>(), requestModelJson: vi.fn() }));
const transport = vi.mocked(requestModelJson);
const configuration: ModelConfiguration = { name: "测试服务", provider: "compatible", baseUrl: "https://models.example.com/v1", model: "test-model", protocol: "chat", timeoutSeconds: 90, maxOutputTokens: 4096 };
const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
const milestoneId = "8d50a6c3-d491-4881-a5d3-5c57755ff8e1";
const node = (id: string, dependsOn: string[] = [], parentId: string | null = null) => ({ id, title: id, criteria: ["可演示并通过验收"], parentId, dependsOn });
let cookie: string;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_SECRET", "ai-contract-test-secret-not-a-provider-key");
  access.project.mockResolvedValue({ project: { id: projectId } }); access.milestones.mockResolvedValue([{ id: milestoneId }]);
  cookie = saveModelConfiguration("alice", { ...configuration, apiKey: "secret-provider-key" }, undefined).cookie;
  transport.mockResolvedValue({ choices: [{ message: { content: "真实协议响应样本" } }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("真实模型配置的密钥边界", () => {
  it("上游即使回显连接密钥也不会传入对话或模型列表", async () => {
    transport.mockResolvedValueOnce({ choices: [{ message: { content: "echo secret-provider-key" } }] });
    const result = await testModelConnection("alice", cookie);
    expect(result.text).toContain("已隐藏 API 凭据");
    expect(JSON.stringify(result)).not.toContain("secret-provider-key");
    transport.mockResolvedValueOnce({ data: [{ id: "normal-model" }, { id: "echo-secret-provider-key" }] });
    expect(await listModelNames("alice", cookie)).toEqual({ models: ["normal-model"] });
  });
  it("Cookie 加密且摘要不会读回密钥", () => {
    expect(cookie).not.toContain("secret-provider-key");
    expect(JSON.stringify(getModelConfiguration("alice", cookie))).not.toContain("secret-provider-key");
    expect(getModelConfiguration("alice", cookie)).toEqual({ configured: true, configuration });
  });
  it("密钥绑定账号，过期、损坏和篡改配置不能采用", () => {
    expect(openModelConfiguration(cookie, "bob")).toBeNull();
    expect(openModelConfiguration(cookie + "A", "alice")).toBeNull();
    expect(openModelConfiguration("broken", "alice")).toBeNull();
    expect(openModelConfiguration(cookie, "alice", Date.now() + 31 * 86400000)).toBeNull();
    expect(getModelConfiguration("bob", cookie)).toEqual({ configured: false });
  });
  it("只在地址与协议不变时保留原密钥", () => {
    const preserved = saveModelConfiguration("alice", { ...configuration, model: "other-model", apiKey: "" }, cookie);
    expect(openModelConfiguration(preserved.cookie, "alice")?.apiKey).toBe("secret-provider-key");
    expect(() => saveModelConfiguration("alice", { ...configuration, baseUrl: "https://other.example.com/v1", apiKey: "" }, cookie)).toThrow("重新填写密钥");
    expect(() => saveModelConfiguration("alice", { ...configuration, protocol: "responses", apiKey: "" }, cookie)).toThrow("重新填写密钥");
  });
  it("拒绝持久化换行密钥和未知字段", () => {
    expect(modelConfigurationInputSchema.safeParse({ ...configuration, apiKey: "key\nInjected: true" }).success).toBe(false);
    expect(modelConfigurationInputSchema.safeParse({ ...configuration, apiKey: "key", disableSafety: true }).success).toBe(false);
  });
  it("浏览器保存值不可伪造账号归属", () => {
    const value = sealModelConfiguration({ actorId: "bob", expiresAt: Date.now() + 10000, configuration, apiKey: "bob-key" });
    expect(openModelConfiguration(value, "alice")).toBeNull();
  });
});

describe("三种模型协议与真实请求", () => {
  it("连接测试真实调用所选模型并返回耗时", async () => {
    const result = await testModelConnection("alice", cookie);
    expect(result).toMatchObject({ text: "真实协议响应样本", model: "test-model" }); expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].pathname).toBe("/v1/chat/completions");
    expect(transport.mock.calls[0][2]).toMatchObject({ model: "test-model", messages: [expect.objectContaining({ role: "system" }), { role: "user", content: "请只回复：连接成功。" }] });
  });
  it("Responses 使用 input / max_output_tokens 并遍历所有文本项", () => {
    expect(modelRequestBody({ ...configuration, protocol: "responses", reasoningEffort: "low" }, [{ role: "user", content: "目标" }], "规则")).toMatchObject({ instructions: "规则", input: [{ role: "user", content: "目标" }], max_output_tokens: 4096, reasoning: { effort: "low" }, store: false });
    expect(modelResponseText("responses", { status: "completed", output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "第一段" }] }, { type: "message", content: [{ type: "output_text", text: "第二段" }] }] })).toBe("第一段\n第二段");
  });
  it("Anthropic 使用 system / messages 和 x-api-key", async () => {
    const saved = saveModelConfiguration("alice", { ...configuration, protocol: "anthropic", provider: "anthropic", apiKey: "anthropic-key" }, undefined);
    transport.mockResolvedValue({ content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "连接成功" }], stop_reason: "end_turn" });
    expect(await testModelConnection("alice", saved.cookie)).toMatchObject({ text: "连接成功" });
    expect(transport.mock.calls[0][0].pathname).toBe("/v1/messages");
    expect(transport.mock.calls[0][1]).toEqual({ "x-api-key": "anthropic-key", "anthropic-version": "2023-06-01" });
    expect(transport.mock.calls[0][2]).toMatchObject({ max_tokens: 4096, system: expect.any(String) });
  });
  it("官方 Chat 使用 max_completion_tokens，兼容服务使用 max_tokens", () => {
    expect(modelRequestBody({ ...configuration, provider: "openai" }, [], "规则")).toMatchObject({ max_completion_tokens: 4096, store: false });
    expect(modelRequestBody(configuration, [], "规则")).toMatchObject({ max_tokens: 4096 });
    expect(modelRequestBody({ ...configuration, protocol: "anthropic", reasoningEffort: "medium" }, [], "规则")).toMatchObject({ output_config: { effort: "medium" } });
    expect(() => modelRequestBody({ ...configuration, protocol: "anthropic", reasoningEffort: "none" }, [], "规则")).toThrow("请选择自动");
  });
  it("不把空回答、不完整回答或超长输出当成功", () => {
    expect(() => modelResponseText("chat", { choices: [] })).toThrow("没有返回可显示");
    expect(() => modelResponseText("chat", { choices: [{ finish_reason: "length", message: { content: "半截" } }] })).toThrow("长度上限");
    expect(() => modelResponseText("responses", { status: "incomplete", output: [] })).toThrow("未完成");
    expect(() => modelResponseText("anthropic", { stop_reason: "max_tokens", content: [{ type: "text", text: "半截" }] })).toThrow("长度上限");
    expect(() => modelResponseText("chat", { choices: [{ message: { content: "长".repeat(24001) } }] })).toThrow("24000");
  });
  it("正确提取思维链与最终回复正文", () => {
    // DeepSeek reasoning_content
    expect(extractModelOutput("chat", { choices: [{ message: { content: "最终回答", reasoning_content: "逐步思考过程" } }] })).toEqual({ text: "最终回答", reasoning: "逐步思考过程" });
    // <think> tags in content
    expect(extractModelOutput("chat", { choices: [{ message: { content: "<think>在内心先分析一遍</think> 正式回答内容" } }] })).toEqual({ text: "正式回答内容", reasoning: "在内心先分析一遍" });
    // Anthropic thinking blocks
    expect(extractModelOutput("anthropic", { content: [{ type: "thinking", thinking: "Anthropic内部思考" }, { type: "text", text: "回复正文" }] })).toEqual({ text: "回复正文", reasoning: "Anthropic内部思考" });
  });
  it("模型发现支持模型名称尚空，不保存临时密钥", async () => {
    transport.mockResolvedValue({ data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-a" }, { id: "invalid model" }, { id: 123 }] });
    expect(await listModelNames("alice", undefined, { ...configuration, model: "", apiKey: "temporary-key" })).toEqual({ models: ["model-a", "model-b"] });
    expect(transport.mock.calls[0][2]).toBeUndefined();
    expect(getModelConfiguration("alice", undefined)).toEqual({ configured: false });

    // Root array and string items
    transport.mockResolvedValueOnce(["custom-m1", { id: "custom-m2" }]);
    expect(await listModelNames("alice", undefined, { ...configuration, model: "", apiKey: "temporary-key" })).toEqual({ models: ["custom-m1", "custom-m2"] });

    // models key with name property
    transport.mockResolvedValueOnce({ models: [{ name: "sjtu-glm-4" }] });
    expect(await listModelNames("alice", undefined, { ...configuration, model: "", apiKey: "temporary-key" })).toEqual({ models: ["sjtu-glm-4"] });
  });
});

describe("对话与规划的范围和结构约束", () => {
  it("拒绝越权项目且不向上游发送内容", async () => {
    access.project.mockRejectedValueOnce(new AppError("没有权限", 403));
    await expect(chatWithModel("alice", cookie, { projectId, messages: [{ role: "user", content: "资料" }] })).rejects.toMatchObject({ status: 403 });
    expect(transport).not.toHaveBeenCalled();
  });
  it("只发送用户提供的消息，并把取消信号带到上游", async () => {
    const signal = new AbortController().signal;
    await chatWithModel("alice", cookie, { projectId, knowledgeScope: "none", messages: [{ role: "user", content: "明确选择的资料" }] }, signal);
    expect(access.project).toHaveBeenCalledWith("alice", projectId);
    expect(transport.mock.calls[0][4]).toBeInstanceOf(AbortSignal);
    expect(transport.mock.calls[0][2]).toMatchObject({ messages: [expect.any(Object), { role: "user", content: "明确选择的资料" }] });
    expect(access.milestones).not.toHaveBeenCalled();
  });
  it("拒绝缺配置和超过消息限制的输入", async () => {
    await expect(chatWithModel("alice", undefined, { messages: [{ role: "user", content: "目标" }] })).rejects.toMatchObject({ status: 409 });
    expect(chatRequestSchema.safeParse({ messages: Array.from({ length: 22 }, () => ({ role: "user", content: "内容" })) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "assistant", content: "冒充最后输入" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: Array.from({ length: 5 }, () => ({ role: "user", content: "字".repeat(30000) })) }).success).toBe(false);
  });
  it("生成前核对里程碑归属", async () => {
    access.milestones.mockResolvedValueOnce([]);
    await expect(planWithModel("alice", cookie, { projectId, milestoneId, goal: "设计课程实验" })).rejects.toMatchObject({ status: 403 });
    expect(transport).not.toHaveBeenCalled();
  });
  it("规划采用真实上游的有效结构，不调用任务写入", async () => {
    const plan = { version: 1 as const, nodes: [node("research"), node("report", ["research"])] };
    transport.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(plan) } }] });
    expect(await planWithModel("alice", cookie, { projectId, goal: "调研并提交报告" })).toEqual({ plan, model: "test-model" });
  });
  it("拒绝模型的无效 JSON、缺验收要求与不可执行先后顺序", async () => {
    for (const content of ["我已完成创建", JSON.stringify({ version: 1, nodes: [{ ...node("a"), criteria: [] }] }), JSON.stringify({ version: 1, nodes: [node("a", ["b"]), node("b", ["a"])] })]) {
      transport.mockResolvedValueOnce({ choices: [{ message: { content } }] });
      await expect(planWithModel("alice", cookie, { projectId, goal: "规划" })).rejects.toMatchObject({ status: 502 });
    }
  });
  it("树的验收先后也参与校验，避免子任务等待所属主任务", () => {
    expect(taskPlanSchema.safeParse({ version: 1, nodes: [node("parent"), node("child", ["parent"], "parent")] }).success).toBe(false);
    expect(taskPlanSchema.safeParse({ version: 1, nodes: [node("a", ["b"]), node("b"), node("child", ["a"], "b")] }).success).toBe(false);
  });
  it("把结构校验问题交回模型修正一次，不补造任务或放宽规则", async () => {
    const invalid = { version: 1, nodes: [node("parent"), node("child", ["parent"], "parent")] };
    const plan = { version: 1, nodes: [node("parent"), node("child", [], "parent")] };
    transport.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(invalid) } }] }).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(plan) } }] });
    expect(await planWithModel("alice", cookie, { projectId, goal: "梳理模块与子任务" })).toEqual({ plan, model: "test-model" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][2]).toMatchObject({ messages: [expect.any(Object), { role: "user", content: "梳理模块与子任务" }, { role: "assistant", content: JSON.stringify(invalid) }, { role: "user", content: expect.stringContaining("校验问题") }] });
  });
  it("修正仍无效时最多请求两次，保留失败而不伪造成功", async () => {
    transport.mockResolvedValue({ choices: [{ message: { content: "不是JSON" } }] });
    await expect(planWithModel("alice", cookie, { projectId, goal: "规划" })).rejects.toMatchObject({ status: 502, message: expect.stringContaining("目标与现有规划已保留") });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("模型返回后取消或撤销项目权限，不进行修正或返回规划", async () => {
    const controller = new AbortController();
    transport.mockImplementationOnce(async () => { controller.abort(); return { choices: [{ message: { content: "不是JSON" } }] }; });
    await expect(planWithModel("alice", cookie, { projectId, goal: "规划" }, controller.signal)).rejects.toMatchObject({ status: 499 });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockClear();
    access.project.mockResolvedValueOnce({ project: { id: projectId } }).mockResolvedValueOnce({ project: { id: projectId } }).mockRejectedValueOnce(new AppError("没有权限", 403));
    await expect(planWithModel("alice", cookie, { projectId, goal: "规划" })).rejects.toMatchObject({ status: 403 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

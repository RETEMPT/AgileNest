import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/modules/core";
import { assistTaskPlan, saveModelConfiguration } from "@/modules/ai/service";
import { modelAssistPOST } from "@/modules/ai/api";
import { requestModelJson } from "@/modules/ai/transport";
import { appendClarificationAnswers, adoptCriteriaSuggestions } from "@/components/ai/planning-coach";
import type { TaskPlan } from "@/modules/ai/client";

const access = vi.hoisted(() => ({ project: vi.fn(), milestones: vi.fn(), user: vi.fn() }));
vi.mock("@/modules/core", async (original) => ({ ...await original<typeof import("@/modules/core")>(), requireProjectForUser: access.project }));
vi.mock("@/modules/milestone", () => ({ listMilestones: access.milestones }));
vi.mock("@/lib/api", () => ({ requireApiUser: access.user }));
vi.mock("@/modules/ai/transport", async (original) => ({ ...await original<typeof import("@/modules/ai/transport")>(), requestModelJson: vi.fn() }));
const transport = vi.mocked(requestModelJson);
const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
const milestoneId = "8d50a6c3-d491-4881-a5d3-5c57755ff8e1";
const plan: TaskPlan = { version: 1, nodes: [{ id: "login", title: "登录", criteria: ["登录正常", "错误时显示原因"], parentId: null, dependsOn: [] }] };
const questions = { mode: "clarify" as const, questions: [{ question: "谁使用登录功能？", reason: "目标尚未说明使用者" }] };
const review = { mode: "review" as const, suggestions: [{ nodeId: "login", criterionIndex: 0, evidence: "登录正常", reason: "未说明如何核验成功", replacement: "使用已存在的有效账号登录后显示当前账号姓名" }] };
let cookie: string;
const output = (value: unknown) => transport.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(value) } }] });
const input = { projectId, goal: "实现已有账号登录" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_SECRET", "planning-coach-test-only");
  access.project.mockResolvedValue({ project: { id: projectId } }); access.milestones.mockResolvedValue([{ id: milestoneId }]); access.user.mockResolvedValue({ id: "alice" });
  cookie = saveModelConfiguration("alice", { name: "测试", provider: "compatible", baseUrl: "https://models.example.com/v1", model: "coach-model", protocol: "chat", timeoutSeconds: 90, maxOutputTokens: 4096, apiKey: "virtual-test-key" }, undefined).cookie;
});
afterEach(() => vi.unstubAllEnvs());

describe("可选规划辅导的真实模型链路", () => {
  it("只发送选中的目标与当前规划，并向上游传递取消信号", async () => {
    output(questions); const signal = new AbortController().signal;
    expect(await assistTaskPlan("alice", cookie, { ...input, mode: "clarify", plan }, signal)).toEqual({ ...questions, model: "coach-model" });
    expect(access.project).toHaveBeenCalledWith("alice", projectId);
    expect(transport.mock.calls[0][4]).toBe(signal);
    expect(transport.mock.calls[0][2]).toMatchObject({ messages: [expect.objectContaining({ role: "system", content: expect.stringContaining("不得编造业务事实、数字") }), { role: "user", content: JSON.stringify({ goal: input.goal, plan }) }] });
  });
  it("拒绝项目越权和不属于项目的里程碑，不发模型请求", async () => {
    access.project.mockRejectedValueOnce(new AppError("没有权限", 403));
    await expect(assistTaskPlan("alice", cookie, { ...input, mode: "clarify" })).rejects.toMatchObject({ status: 403 });
    access.milestones.mockResolvedValueOnce([]);
    await expect(assistTaskPlan("alice", cookie, { ...input, mode: "clarify", milestoneId })).rejects.toMatchObject({ status: 403 });
    expect(transport).not.toHaveBeenCalled();
  });
  it("未配置、空规划检查均拒绝，空问题列表可以正常返回", async () => {
    await expect(assistTaskPlan("alice", undefined, { ...input, mode: "clarify" })).rejects.toMatchObject({ status: 409 });
    await expect(assistTaskPlan("alice", cookie, { ...input, mode: "review" })).rejects.toThrow("先生成或填写");
    output({ mode: "clarify", questions: [] });
    expect(await assistTaskPlan("alice", cookie, { ...input, mode: "clarify" })).toMatchObject({ questions: [] });
  });
  it("验收建议必须逐字引用当前任务的已有要求，可返回待确认且无改写的建议", async () => {
    output(review); expect(await assistTaskPlan("alice", cookie, { ...input, mode: "review", plan })).toMatchObject(review);
    output({ ...review, suggestions: [{ ...review.suggestions[0], replacement: null }] });
    expect(await assistTaskPlan("alice", cookie, { ...input, mode: "review", plan })).toMatchObject({ suggestions: [{ replacement: null }] });
    for (const patch of [{ evidence: "伪造原文" }, { nodeId: "other" }, { criterionIndex: 4 }]) {
      output({ ...review, suggestions: [{ ...review.suggestions[0], ...patch }] });
      await expect(assistTaskPlan("alice", cookie, { ...input, mode: "review", plan })).rejects.toMatchObject({ status: 502 });
    }
  });
  it("空验收列表只给补充提示，拒绝无效格式、错模式、重复条目与过量问题", async () => {
    const emptyPlan = { ...plan, nodes: [{ ...plan.nodes[0], criteria: [] }] };
    output({ mode: "review", suggestions: [{ ...review.suggestions[0], evidence: "", replacement: null }] });
    expect(await assistTaskPlan("alice", cookie, { ...input, mode: "review", plan: emptyPlan })).toMatchObject({ mode: "review" });
    for (const result of [{ done: true }, { mode: "review", suggestions: [] }, { ...questions, questions: Array(5).fill(questions.questions[0]) }]) {
      output(result); await expect(assistTaskPlan("alice", cookie, { ...input, mode: "clarify" })).rejects.toMatchObject({ status: 502 });
    }
    output({ ...review, suggestions: [review.suggestions[0], review.suggestions[0]] });
    await expect(assistTaskPlan("alice", cookie, { ...input, mode: "review", plan })).rejects.toMatchObject({ status: 502 });
  });
  it("薄 API 校验同源、登录、请求与密钥会话，正常结果不缓存", async () => {
    const request = (origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/v1/ai/assist", { method: "POST", headers: { origin, "content-type": "application/json", cookie: `agilenest-ai-model=${cookie}` }, body: JSON.stringify({ ...input, mode: "clarify" }) });
    expect((await modelAssistPOST(request("https://other.example"))).status).toBe(403);
    access.user.mockRejectedValueOnce(new AppError("未登录", 401)); expect((await modelAssistPOST(request())).status).toBe(401);
    expect(transport).not.toHaveBeenCalled();
    output(questions); const response = await modelAssistPOST(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ...questions, model: "coach-model" });
  });
});

describe("本人选择采纳，不修改原规划", () => {
  it("只加入已答复的问题，拒绝空答案及超长目标", () => {
    expect(appendClarificationAnswers("目标", [...questions.questions, { question: "未答问题" }], ["学生", ""])).toBe("目标\n\n补充确认：\n问：谁使用登录功能？\n本人确认：学生");
    expect(() => appendClarificationAnswers("目标", questions.questions, [" "])).toThrow("至少一条");
    expect(() => appendClarificationAnswers("字".repeat(30000), questions.questions, ["答"])).toThrow("超过 30000");
  });
  it("采用指定改写保留其余要求，原对象不变", () => {
    const next = adoptCriteriaSuggestions(plan, review, [0]);
    expect(next.nodes[0].criteria).toEqual([review.suggestions[0].replacement, "错误时显示原因"]);
    expect(plan.nodes[0].criteria[0]).toBe("登录正常");
  });
  it("拒绝旧条目、没有改写、重复要求与空选择", () => {
    expect(() => adoptCriteriaSuggestions(plan, { ...review, suggestions: [{ ...review.suggestions[0], evidence: "旧值" }] }, [0])).toThrow("已变化");
    expect(() => adoptCriteriaSuggestions(plan, { ...review, suggestions: [{ ...review.suggestions[0], replacement: null }] }, [0])).toThrow("已变化");
    expect(() => adoptCriteriaSuggestions(plan, { ...review, suggestions: [{ ...review.suggestions[0], replacement: "错误时显示原因" }] }, [0])).toThrow("重复");
    expect(() => adoptCriteriaSuggestions(plan, review, [])).toThrow("先选择");
  });
});

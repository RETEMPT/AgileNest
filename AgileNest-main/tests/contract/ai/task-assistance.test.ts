import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { applyTaskAssistance, assistExistingTask } from "@/modules/ai/task-assistance";
import { applyTaskAssistancePOST, taskAssistancePOST } from "@/modules/ai/task-assistance-api";
import { applyTaskAssistanceSchema, selectedTaskAssistancePatch, taskAssistanceResultSchema, taskAssistanceSuggestionSchema } from "@/modules/ai/task-assistance-client";

const mocks = vi.hoisted(() => ({ task: vi.fn(), delivery: vi.fn(), update: vi.fn(), generate: vi.fn(), provider: vi.fn(), plugin: vi.fn(), user: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/tasks", () => ({ getTaskDetail: mocks.task, getTaskDelivery: mocks.delivery, updateTask: mocks.update }));
vi.mock("@/modules/ai/service", () => ({ generate: mocks.generate, chatWithModel: vi.fn(), planWithModel: vi.fn(), assistTaskPlan: vi.fn(), testModelConnection: vi.fn(), listModelNames: vi.fn() }));
vi.mock("@/modules/ai/providers", () => ({ resolveModelProvider: mocks.provider, activeModelSummary: vi.fn(), listModelProviders: vi.fn(), saveModelProvider: vi.fn(), changeModelProvider: vi.fn() }));
vi.mock("@/modules/ai/plugins", () => ({ requireBuiltinPlugin: mocks.plugin }));
vi.mock("@/lib/api", () => ({ requireApiUser: mocks.user }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));

const taskId = "6719707f-3763-414c-9254-3ec3531a86c9";
const projectId = "8d50a6c3-d491-4881-a5d3-5c57755ff8e1";
const version = "2026-10-16T02:00:00.000Z";
const task = { id: taskId, projectId, title: "研究方案", description: "整理现有调研资料", status: "in_progress", updatedAt: new Date(version), permissions: { actions: ["update"] } };
const requirements = { version: 1, criteria: [{ id: "legacy-criterion", text: "说明引用资料和结论依据" }] };
const suggestion = { title: "整理研究方案与依据", description: "依据已有资料整理研究方案，说明引用资料与结论依据。", rationale: "保留原目标与验收要求，明确产物。", extensions: [{ title: "补充对比材料", reason: "可选拓展，需确认是否增加工作。", addition: "补充不同方案的对比说明。" }], questions: ["有哪些已经确认的方案？"], roadmap: [{ title: "梳理资料", outcome: "形成已有资料清单。", orderNote: "先梳理资料，再整理结论。" }] };
const input = { taskId, expectedUpdatedAt: version, brief: "使用已有资料，不增加未经确认的指标" };
const result = () => taskAssistanceResultSchema.parse({ task: { id: taskId, projectId, title: task.title, description: task.description, status: task.status, updatedAt: version }, requirements, suggestion, model: "test-model" });
function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/v1/ai/task-assist", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.task.mockResolvedValue(task); mocks.delivery.mockResolvedValue({ requirements, submissions: [] });
  mocks.update.mockResolvedValue({ ...task, title: suggestion.title, updatedAt: new Date("2026-10-16T02:01:00.000Z") });
  mocks.generate.mockResolvedValue({ text: JSON.stringify(suggestion), model: "test-model" });
  mocks.provider.mockResolvedValue({ configuration: { model: "test-model" } }); mocks.plugin.mockResolvedValue(undefined); mocks.user.mockResolvedValue({ id: "member" });
});

describe("已有任务的独立 AI 建议", () => {
  it("只发送真实任务、验收要求与本人补充，生成不会写任务", async () => {
    const signal = new AbortController().signal;
    const generated = await assistExistingTask("member", "legacy-cookie", input, signal);
    expect(generated).toMatchObject({ task: { title: task.title, updatedAt: version }, requirements, suggestion, model: "test-model" });
    expect(mocks.provider).toHaveBeenCalledWith("member", "legacy-cookie");
    const [, messages, instruction, passedSignal] = mocks.generate.mock.calls[0];
    expect(JSON.parse(messages[0].content)).toEqual({ task: { title: task.title, description: task.description, status: task.status }, acceptanceCriteria: [requirements.criteria[0].text], personalBrief: input.brief });
    expect(instruction).toContain("不得编造"); expect(passedSignal).toBe(signal);
    expect(mocks.plugin).toHaveBeenCalledTimes(2); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("无访问权或没有完善任务权限时不查验收、不请求模型", async () => {
    mocks.task.mockRejectedValueOnce(new ForbiddenError("没有项目权限"));
    await expect(assistExistingTask("outsider", undefined, input)).rejects.toBeInstanceOf(ForbiddenError);
    mocks.task.mockResolvedValueOnce({ ...task, permissions: { actions: [] } });
    await expect(assistExistingTask("member", undefined, input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.delivery).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("旧任务没有验收要求时保留版本0，兼容历史验收项字符串标识", async () => {
    mocks.delivery.mockResolvedValue({ requirements: { version: 0, criteria: [] }, submissions: [] });
    expect(taskAssistanceResultSchema.parse(await assistExistingTask("member", undefined, input)).requirements).toEqual({ version: 0, criteria: [] });
    expect(result().requirements.criteria[0].id).toBe("legacy-criterion");
  });
  it("请求版本陈旧时不发送资料；生成中任务或验收变化时拒绝旧建议", async () => {
    await expect(assistExistingTask("member", undefined, { ...input, expectedUpdatedAt: "2026-10-15T02:00:00.000Z" })).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.task.mockResolvedValueOnce(task).mockResolvedValueOnce({ ...task, updatedAt: new Date("2026-10-16T02:00:01.000Z") });
    await expect(assistExistingTask("member", undefined, input)).rejects.toBeInstanceOf(ConflictError);
    mocks.delivery.mockResolvedValueOnce({ requirements, submissions: [] }).mockResolvedValueOnce({ requirements: { ...requirements, version: 2 }, submissions: [] });
    await expect(assistExistingTask("member", undefined, input)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("插件关闭和生成期间被关闭都不返回可用建议", async () => {
    mocks.plugin.mockRejectedValueOnce(new AppError("任务规划插件已关闭", 409));
    await expect(assistExistingTask("member", undefined, input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.plugin.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new AppError("任务规划插件已关闭", 409));
    await expect(assistExistingTask("member", undefined, input)).rejects.toMatchObject({ status: 409 });
  });
  it("模型结构错误、任意动作字段和过量扩展都拒绝，不做业务写入", async () => {
    for (const value of ["不是JSON", JSON.stringify({ ...suggestion, command: "execute" }), JSON.stringify({ ...suggestion, extensions: Array(5).fill(suggestion.extensions[0]) })]) {
      mocks.generate.mockResolvedValueOnce({ text: value, model: "test-model" });
      await expect(assistExistingTask("member", undefined, input)).rejects.toMatchObject({ status: 502 });
    }
    expect(taskAssistanceSuggestionSchema.safeParse({ ...suggestion, roadmap: [] }).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("请求取消后不返回建议也不修改任务", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(assistExistingTask("member", undefined, input, controller.signal)).rejects.toMatchObject({ status: 499 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("用户确认后一次性应用任务修改", () => {
  const apply = { taskId, expectedUpdatedAt: version, title: suggestion.title, description: suggestion.description, confirmed: true };
  it("确认只把标题和背景交给原更新契约，并携带真实版本", async () => {
    await applyTaskAssistance("member", apply);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("member", taskId, { title: suggestion.title, description: suggestion.description }, version);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("拒绝未确认、无选择和额外状态/负责人/验收字段", async () => {
    for (const value of [{ ...apply, confirmed: false }, { taskId, expectedUpdatedAt: version, confirmed: true }, { ...apply, status: "accepted" }, { ...apply, acceptanceCriteria: [] }, { ...apply, assigneeId: taskId }]) {
      await expect(applyTaskAssistance("member", value)).rejects.toBeInstanceOf(AppError);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("权限撤销、冻结和旧版本均不写入", async () => {
    mocks.task.mockResolvedValueOnce({ ...task, permissions: { actions: [] } });
    await expect(applyTaskAssistance("member", apply)).rejects.toBeInstanceOf(ForbiddenError);
    for (const status of ["submitted", "accepted"]) {
      mocks.task.mockResolvedValueOnce({ ...task, status });
      await expect(applyTaskAssistance("member", apply)).rejects.toBeInstanceOf(ConflictError);
    }
    await expect(applyTaskAssistance("member", { ...apply, expectedUpdatedAt: "2026-10-15T02:00:00.000Z" })).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("待验收任务可以看建议，但不能借此应用修改", async () => {
    mocks.task.mockResolvedValue({ ...task, status: "submitted" });
    expect(await assistExistingTask("member", undefined, input)).toMatchObject({ task: { status: "submitted" } });
    await expect(applyTaskAssistance("member", apply)).rejects.toMatchObject({ status: 409 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("可选择的建议与薄API边界", () => {
  it("默认无修改，扩展只在本人勾选后追加，不替换原工作背景", () => {
    const source = result();
    expect(selectedTaskAssistancePatch(source, { title: false, description: false, extensions: [] })).toEqual({});
    const patch = selectedTaskAssistancePatch(source, { title: true, description: false, extensions: [0] });
    expect(patch.title).toBe(suggestion.title); expect(patch.description).toContain(task.description);
    expect(patch.description).toContain(suggestion.extensions[0].addition); expect(source.task.description).toBe(task.description);
  });
  it("不会应用未选择的扩展，拒绝失效/重复选项与超长背景", () => {
    expect(selectedTaskAssistancePatch(result(), { title: false, description: true, extensions: [] })).toEqual({ description: suggestion.description });
    for (const extensions of [[3], [0, 0], [-1]]) expect(() => selectedTaskAssistancePatch(result(), { title: false, description: false, extensions })).toThrow("已变化");
    const source = result(); source.task.description = "字".repeat(10000);
    expect(() => selectedTaskAssistancePatch(source, { title: false, description: false, extensions: [0] })).toThrow("10000");
  });
  it("API同源与登录守卫先于读取任务，错误不泄露模型信息", async () => {
    expect((await taskAssistancePOST(request(input, "https://other.example"))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.task).not.toHaveBeenCalled();
    mocks.user.mockRejectedValueOnce(new AppError("未登录", 401)); expect((await taskAssistancePOST(request(input))).status).toBe(401);
    mocks.provider.mockRejectedValueOnce(new Error("sensitive-model-key"));
    const failed = await taskAssistancePOST(request(input));
    expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("sensitive-model-key");
  });
  it("应用API不缓存，真实成功后才刷新任务页面", async () => {
    const invalid = await applyTaskAssistancePOST(request({ taskId, expectedUpdatedAt: version, title: "新标题", confirmed: false }));
    expect(invalid.status).toBe(400); expect(mocks.refresh).not.toHaveBeenCalled();
    const response = await applyTaskAssistancePOST(request({ taskId, expectedUpdatedAt: version, title: "新标题", confirmed: true }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.update).toHaveBeenCalledTimes(1); expect(mocks.refresh).toHaveBeenCalledWith(`/p/${projectId}/tasks/${taskId}`);
    expect(applyTaskAssistanceSchema.safeParse({ taskId, expectedUpdatedAt: version, confirmed: true }).success).toBe(false);
  });
});

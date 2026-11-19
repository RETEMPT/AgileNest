import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { generateProjectReport } from "@/modules/ai/report";
import { projectReportPOST } from "@/modules/ai/report-api";
import { projectReportResultSchema } from "@/modules/ai/report-client";

const mocks = vi.hoisted(() => ({ project: vi.fn(), tasks: vi.fn(), contribution: vi.fn(), progress: vi.fn(), milestones: vi.fn(), generate: vi.fn(), provider: vi.fn(), user: vi.fn() }));
vi.mock("@/modules/core", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/core")>()), requireProjectForUser: mocks.project }));
vi.mock("@/modules/tasks", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/tasks")>()), listProjectTasks: mocks.tasks }));
vi.mock("@/modules/worklog", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/worklog")>()), memberContribution: mocks.contribution, projectProgress: mocks.progress }));
vi.mock("@/modules/milestone", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/milestone")>()), listMilestones: mocks.milestones }));
vi.mock("@/modules/ai/service", () => ({ generate: mocks.generate, chatWithModel: vi.fn(), planWithModel: vi.fn(), assistTaskPlan: vi.fn(), testModelConnection: vi.fn(), listModelNames: vi.fn() }));
vi.mock("@/modules/ai/providers", () => ({ resolveModelProvider: mocks.provider, activeModelSummary: vi.fn(), listModelProviders: vi.fn(), saveModelProvider: vi.fn(), changeModelProvider: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireApiUser: mocks.user }));

const projectId = "8d50a6c3-d491-4881-a5d3-5c57755ff8e1";
const access = { project: { id: projectId, teamId: "team", name: "课设项目", kind: "course", startDate: null, endDate: null }, role: "admin", positions: [], capabilities: {} };
const progress = { total: 3, accepted: 2, ratio: 2 / 3, active: 1, overdue: 1, attention: 1, statusCounts: { unclaimed: 0, in_progress: 1, submitted: 0, accepted: 2, rejected: 0 } };
const tasks = [
  { id: "t1", title: "需求分析", status: "accepted", assigneeName: "张三", dueDate: null, parentTaskId: null, milestoneId: null },
  { id: "t2", title: "编码实现", status: "in_progress", assigneeName: "李四", dueDate: "2026-11-20", parentTaskId: null, milestoneId: null },
];
const contribution = [{ userName: "张三", tasksTotal: 2, tasksAccepted: 1, tasksSubmitted: 0, completionRatio: 0.5, overdue: 0 }];
const milestones = [{ id: "m1", title: "中期检查", targetDate: "2026-11-30", status: "open", kind: "midterm" }];

function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/v1/ai/report", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue(access);
  mocks.tasks.mockResolvedValue(tasks);
  mocks.contribution.mockResolvedValue(contribution);
  mocks.progress.mockResolvedValue(progress);
  mocks.milestones.mockResolvedValue(milestones);
  mocks.generate.mockResolvedValue({ text: "# 项目周报\n\n## 本周概览\n完成 2/3 项。", model: "test-model" });
  mocks.provider.mockResolvedValue({ configuration: { model: "test-model" } });
  mocks.user.mockResolvedValue({ id: "member" });
});

describe("AI 项目报告", () => {
  it("聚合项目数据生成中文周报，只读不写任务", async () => {
    const result = await generateProjectReport("member", "cookie", { projectId, kind: "weekly", brief: "强调需求分析" });
    expect(projectReportResultSchema.parse(result)).toEqual({ text: result.text, model: "test-model" });
    expect(mocks.provider).toHaveBeenCalledWith("member", "cookie");
    const [, messages, instruction] = mocks.generate.mock.calls[0];
    const content = JSON.parse(messages[0].content);
    expect(content.project.name).toBe("课设项目");
    expect(content.tasks).toHaveLength(2);
    expect(content.members[0].name).toBe("张三");
    expect(content.brief).toBe("强调需求分析");
    expect(instruction).toContain("不得编造");
    expect(instruction).toContain("项目周报");
  });
  it("kind 为 defense 时按答辩讲稿撰写", async () => {
    await generateProjectReport("member", undefined, { projectId, kind: "defense" });
    const [, , instruction] = mocks.generate.mock.calls[0];
    expect(instruction).toContain("答辩讲稿");
  });
  it("非项目成员直接拒绝，不请求模型", async () => {
    mocks.project.mockRejectedValueOnce(new ForbiddenError());
    await expect(generateProjectReport("outsider", undefined, { projectId })).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("未配置模型时返回可读错误，不生成", async () => {
    mocks.provider.mockRejectedValueOnce(new ConflictError("请先在模型配置页面保存并启用一个模型服务"));
    await expect(generateProjectReport("member", undefined, { projectId })).rejects.toMatchObject({ status: 409 });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("API同源与登录守卫先于读取数据，错误不泄露模型信息", async () => {
    expect((await projectReportPOST(request({ projectId }, "https://other.example"))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.user.mockRejectedValueOnce(new AppError("未登录", 401));
    expect((await projectReportPOST(request({ projectId }))).status).toBe(401);
    mocks.provider.mockRejectedValueOnce(new Error("sensitive-model-key"));
    const failed = await projectReportPOST(request({ projectId }));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("sensitive-model-key");
  });
});

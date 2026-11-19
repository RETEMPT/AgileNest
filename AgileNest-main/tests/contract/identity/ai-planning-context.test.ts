import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiWorkspaceView } from "@/components/ai/view";

const queries = vi.hoisted(() => ({ user: vi.fn(), projects: vi.fn(), milestones: vi.fn(), task: vi.fn(), delivery: vi.fn() }));
vi.mock("@/modules/core", () => ({ requireUser: queries.user, AppError: class AppError extends Error { constructor(message: string, public status = 400) { super(message); } } }));
vi.mock("@/modules/identity", () => ({ listMyProjects: queries.projects }));
vi.mock("@/modules/milestone", () => ({ listMilestones: queries.milestones }));
vi.mock("@/modules/tasks", () => ({ getTaskDetail: queries.task, getTaskDelivery: queries.delivery }));
vi.mock("@/components/ai/workspace", async () => {
  const { createElement } = await import("react");
  return { AiWorkspace: (props: { userId: string; planningContext?: { title: string; sourceText?: string }; planningError: boolean }) => createElement("div", { "data-user": props.userId, "data-planning": props.planningContext?.title, "data-source": props.planningContext?.sourceText, "data-error": props.planningError }) };
});
const projectId = "e0118b15-e679-43d1-8b48-046fc04272f3";
const milestoneId = "e7403ab5-e4ac-4575-8a0a-91166b317ed8";

beforeEach(() => {
  vi.clearAllMocks();
  queries.user.mockResolvedValue({ id: "current-user" });
  queries.projects.mockResolvedValue([{ id: projectId, name: "课程项目", teamName: "课程组" }]);
  queries.milestones.mockResolvedValue([{ id: milestoneId, title: "中期成果" }]);
  queries.task.mockResolvedValue({ id: milestoneId, projectId, title: "来源任务", description: "真实工作背景" });
  queries.delivery.mockResolvedValue({ requirements: { criteria: [{ id: "criterion", text: "可验证的要求" }] } });
});

describe("里程碑进入 AI 规划的范围校验", () => {
  it("普通打开 AI 不主动读取里程碑或任务", async () => {
    const html = renderToStaticMarkup(await AiWorkspaceView());
    expect(queries.milestones).not.toHaveBeenCalled();
    expect(html).toContain('data-error="false"');
  });
  it("有效请求只使用当前会话读取指定可访问项目", async () => {
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId, milestoneId }) }));
    expect(queries.milestones).toHaveBeenCalledWith("current-user", projectId);
    expect(html).toContain('data-planning="中期成果"');
  });
  it("项目级规划使用可访问项目标题，不读取其他业务内容", async () => {
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId }) }));
    expect(queries.milestones).not.toHaveBeenCalled();
    expect(html).toContain('data-planning="课程项目"');
    expect(html).toContain('data-error="false"');
  });
  it("URL 不能授权访问其他项目", async () => {
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId: "a638414d-6028-4c06-a303-58e0a2d1237f", milestoneId }) }));
    expect(queries.milestones).not.toHaveBeenCalled();
    expect(html).toContain('data-error="true"');
    expect(html).not.toContain("中期成果");
  });
  it("非法标识不触发业务读取", async () => {
    await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId: "invalid", milestoneId }) });
    expect(queries.milestones).not.toHaveBeenCalled();
  });
  it("不存在或跨项目的里程碑不采用来源标题", async () => {
    queries.milestones.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId, milestoneId }) }));
    expect(html).toContain('data-error="true"');
    expect(html).not.toContain("data-planning");
  });
  it("未登录时不读取项目与规划来源", async () => {
    queries.user.mockRejectedValueOnce(new Error("需要登录"));
    await expect(AiWorkspaceView({ searchParams: Promise.resolve({ planning: "milestone", projectId, milestoneId }) })).rejects.toThrow("需要登录");
    expect(queries.projects).not.toHaveBeenCalled();
    expect(queries.milestones).not.toHaveBeenCalled();
  });
  it("任务来源仅取当前账号可访问的真实任务和验收要求", async () => {
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "task", projectId, taskId: milestoneId }) }));
    expect(queries.task).toHaveBeenCalledWith("current-user", milestoneId);
    expect(queries.delivery).toHaveBeenCalledWith("current-user", milestoneId);
    expect(html).toContain("真实工作背景"); expect(html).toContain("可验证的要求");
  });
  it("跨项目任务不带入标题背景，也不进一步读验收内容", async () => {
    queries.task.mockResolvedValue({ id: milestoneId, projectId: "other", title: "其他项目私有标题", description: "保密背景" });
    const html = renderToStaticMarkup(await AiWorkspaceView({ searchParams: Promise.resolve({ planning: "task", projectId, taskId: milestoneId }) }));
    expect(queries.delivery).not.toHaveBeenCalled(); expect(html).toContain('data-error="true"'); expect(html).not.toContain("保密背景");
  });
});

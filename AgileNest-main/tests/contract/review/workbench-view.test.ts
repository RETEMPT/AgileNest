import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkbenchView } from "@/modules/review/views";

const services = vi.hoisted(() => ({ workbench: vi.fn(), projects: vi.fn() }));
vi.mock("@/modules/review/service", () => ({ getWorkbench: services.workbench, listPendingReview: vi.fn(), listOverdueRisks: vi.fn() }));
vi.mock("@/modules/identity", () => ({ listMyProjects: services.projects }));
vi.mock("@/modules/core", async () => ({
  requireUser: async () => ({ id: "member" }), todayISO: () => "2026-10-14",
  isOverdue: (await import("@/modules/core/dates")).isOverdue, getProjectForUser: vi.fn(),
}));
vi.mock("@/modules/tasks", () => ({ listProjectTasks: vi.fn() }));
vi.mock("@/modules/tasks/ui", () => ({ TaskActions: () => null }));
vi.mock("@/modules/review/ui", () => ({ ReviewTaskDetails: () => null, ReviewSubmissionEvidence: () => null }));

function task(index: number, status = "in_progress", dueDate: string | null = "2026-10-14") {
  return {
    id: String(index).padStart(2, "0"), title: `任务 ${index}`, description: null,
    projectId: "project-a", projectName: "课程项目", assigneeName: "张同学",
    status, dueDate, priority: "medium", sortOrder: index,
    createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-14T00:00:00Z"),
  };
}

async function render(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await WorkbenchView({ searchParams: Promise.resolve(params) }));
}

describe("工作台服务端页面组合", () => {
  beforeEach(() => {
    services.projects.mockResolvedValue([{ id: "project-a", name: "课程项目", teamName: "课程组", status: "active" }]);
    services.workbench.mockResolvedValue({ mine: [], review: [], pool: [] });
  });

  it("摘要使用真实队列计数，快捷入口清除旧列表条件", async () => {
    services.workbench.mockResolvedValue({ mine: [task(1, "rejected"), task(2, "in_progress", "2026-10-13")], review: [task(3, "submitted")], pool: [] });
    const html = await render({ q: "无结果", projectId: "other", page: "9" });
    expect(html).toContain('aria-label="今天到期，1 项，我负责的任务"');
    expect(html).toContain('aria-label="已逾期，1 项，我负责的任务"');
    expect(html).toContain('aria-label="需修改，1 项，查看打回意见并重交"');
    expect(html).toContain('aria-label="待我验收，1 项，核对成果与验收要求"');
    expect(html).toContain('href="/home?view=mine&amp;status=rejected"');
    expect(html).toContain("没有符合筛选条件的任务");
  });

  it("首屏只渲染十二项，默认折叠高级筛选并提供下一页", async () => {
    services.workbench.mockResolvedValue({ mine: Array.from({ length: 13 }, (_, index) => task(index + 1)), review: [], pool: [] });
    const html = await render();
    expect(html).toContain(">任务 12</a>");
    expect(html).not.toContain(">任务 13</a>");
    expect(html).toContain('href="/home?view=mine&amp;page=2"');
    expect(html).toContain("第 1–12 项，共 13 项");
    expect(html).not.toMatch(/<details[^>]*open=/);
  });

  it("第二页保留项目和排序，显示正确范围；移除项目条件回第一页", async () => {
    services.workbench.mockResolvedValue({ mine: Array.from({ length: 13 }, (_, index) => task(index + 1)), review: [], pool: [] });
    const html = await render({ page: "2", projectId: "project-a", sort: "updated" });
    expect(html).toContain(">任务 13</a>");
    expect(html).not.toContain(">任务 12</a>");
    expect(html).toContain("第 13–13 项，共 13 项");
    expect(html).toContain('href="/home?view=mine&amp;projectId=project-a&amp;sort=updated"');
    const clearProject = html.match(/<a\b[^>]*>/g)?.find((link) => link.includes('aria-label="清除项目：课程项目"'));
    expect(clearProject).toContain('href="/home?view=mine&amp;sort=updated"');
    expect(html).toMatch(/<details[^>]*open=/);
  });

  it("无项目和无任务时保留可认领与团队入口，不显示虚假分页", async () => {
    services.projects.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain("暂无负责的任务");
    expect(html).toContain('href="/home?view=pool"');
    expect(html).toContain('href="/t"');
    expect(html).not.toContain('aria-label="工作台任务分页"');
  });
});

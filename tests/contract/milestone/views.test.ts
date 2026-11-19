import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MilestonesView } from "@/modules/milestone/views";
import { MilestoneTaskGroup, MilestoneModuleCard, MilestoneProcess } from "@/modules/milestone/ui";
import { buildMilestoneTaskGraph, filterMilestoneTree, type MilestoneTask } from "@/modules/milestone/client";

const services = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), milestones: vi.fn(), tasks: vi.fn() }));
vi.mock("@/modules/core", () => ({ requireUser: services.user, getProjectForUser: services.access }));
vi.mock("@/modules/milestone", () => ({ listMilestones: services.milestones }));
vi.mock("@/modules/tasks", () => ({ listProjectTasks: services.tasks }));
vi.mock("@/modules/tasks/ui", () => ({ MilestoneForm: () => "里程碑创建表单", CreateTaskForm: () => "任务创建表单" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

describe("里程碑页面读取与权限边界", () => {
  beforeEach(() => {
    services.user.mockResolvedValue({ id: "member" });
    services.access.mockResolvedValue({ role: "admin", capabilities: { task: { actions: ["create"] } } });
    services.milestones.mockResolvedValue([]);
    services.tasks.mockResolvedValue([]);
    services.tasks.mockClear(); services.milestones.mockClear();
  });

  it("使用会话账号与当前项目读取全部任务，不过滤父子项", async () => {
    const html = renderToStaticMarkup(await MilestonesView({ params: Promise.resolve({ projectId: "project" }) }));
    expect(services.tasks).toHaveBeenCalledWith("member", "project");
    expect(services.milestones).toHaveBeenCalledWith("member", "project");
    expect(html).toContain("新建里程碑");
    expect(html).not.toContain("里程碑创建表单");
    expect(html).toContain("项目还没有任务");
    expect(html).toContain("AI 规划任务");
    expect(html).toContain("先后顺序");
    expect(html).not.toMatch(/依赖|阻塞|前置/);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(html).toContain('href="/ai?planning=milestone&amp;projectId=project"');
  });

  it("未获项目访问权先返回不存在，不读取任务与节点", async () => {
    services.access.mockResolvedValue(null);
    await expect(MilestonesView({ params: Promise.resolve({ projectId: "secret" }) })).rejects.toThrow("NOT_FOUND");
    expect(services.tasks).not.toHaveBeenCalled();
    expect(services.milestones).not.toHaveBeenCalled();
  });

  it("成员可查看真实状态和详情链接，创建入口沿用既有角色语义", async () => {
    services.access.mockResolvedValue({ role: "student", capabilities: { task: { actions: ["create"] } } });
    services.tasks.mockResolvedValue([{ id: "task", projectId: "project", milestoneId: null, parentTaskId: null, title: "真实任务", status: "submitted", assigneeName: "李同学", dueDate: "2026-11-02", startDate: null, sortOrder: 0, blockedByIds: [] }]);
    const html = renderToStaticMarkup(await MilestonesView({ params: Promise.resolve({ projectId: "project" }) }));
    expect(html).not.toContain("里程碑创建表单");
    expect(html).toContain("真实任务");
    expect(html).toContain("阶段进程");
    expect(html).toContain("选择一个阶段");
    expect(html).not.toContain("模块与任务</span>");
  });
});

describe("里程碑任务树的初始折叠", () => {
  const tasks: MilestoneTask[] = [
    { id: "parent", projectId: "project", milestoneId: "milestone", parentTaskId: null, title: "课题报告", status: "in_progress", assigneeName: "张同学", dueDate: null, startDate: null, sortOrder: 0, blockedByIds: [] },
    { id: "child", projectId: "project", milestoneId: "milestone", parentTaskId: "parent", title: "研究附录", status: "submitted", assigneeName: "李同学", dueDate: null, startDate: null, sortOrder: 0, blockedByIds: [] },
  ];
  const group = buildMilestoneTaskGraph("project", [{ id: "milestone", projectId: "project", title: "阶段报告", description: null, kind: "custom", status: "open", targetDate: null }], tasks).groups[0];
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  it("里程碑与父任务默认关闭，保留可用的展开控件", () => {
    const html = renderToStaticMarkup(createElement(MilestoneTaskGroup, { projectId: "project", group, query: "", taskById }));
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(html).toContain("<summary");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="展开课题报告的子任务"');
    expect(html).not.toContain('href="/p/project/tasks/child"');
  });

  it("搜索命中子任务时展开分组与父路径，保留再次折叠的按钮", () => {
    const filtered = { ...group, roots: filterMilestoneTree(group.roots, "研究附录") };
    const html = renderToStaticMarkup(createElement(MilestoneTaskGroup, { projectId: "project", group: filtered, query: "研究附录", taskById }));
    expect(html).toMatch(/<details[^>]*\bopen=""/);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="折叠课题报告的子任务"');
    expect(html).toContain('href="/p/project/tasks/parent"');
    expect(html).toContain('href="/p/project/tasks/child"');
  });

  it("主动筛选单个里程碑时仅展开分组，子任务仍默认收起", () => {
    const html = renderToStaticMarkup(createElement(MilestoneTaskGroup, { projectId: "project", group, query: "", taskById, selected: true }));
    expect(html).toMatch(/<details[^>]*\bopen=""/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('href="/p/project/tasks/child"');
  });

  it("模块卡片只显示主任务摘要，进度使用主任务与全部子任务的真实验收数", () => {
    const html = renderToStaticMarkup(createElement(MilestoneModuleCard, { node: group.roots[0], query: "", taskById }));
    expect(html).toContain("工作模块");
    expect(html).toContain('href="/p/project/tasks/parent"');
    expect(html).toContain("张同学");
    expect(html).toContain("进行中");
    expect(html).toContain("0/2 项已验收");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('href="/p/project/tasks/child"');
  });

  it("进程搜索定位子任务，但不会将筛选后的局部任务数冒充完整模块进度", () => {
    const node = filterMilestoneTree(group.roots, "研究附录")[0];
    const html = renderToStaticMarkup(createElement(MilestoneModuleCard, { node, fullNode: group.roots[0], query: "研究附录", taskById }));
    expect(html).toContain('href="/p/project/tasks/child"');
    expect(html).toContain("待验收");
    expect(html).toContain("李同学");
    expect(html).toContain("0/2 项已验收");
    expect(html).toContain('aria-expanded="true"');
  });

  it("阶段总览默认不渲染模块明细，选中后提供真实任务管理与规划入口", () => {
    const props = { projectId: "project", groups: [group], query: "", taskById, selectedId: "all", onSelect: vi.fn() };
    const closed = renderToStaticMarkup(createElement(MilestoneProcess, props));
    expect(closed).toContain('aria-pressed="false"');
    expect(closed).not.toContain('href="/p/project/tasks/parent"');
    const selected = renderToStaticMarkup(createElement(MilestoneProcess, { ...props, selectedId: "milestone" }));
    expect(selected).toContain('aria-pressed="true"');
    expect(selected).toContain('href="/p/project/tasks/parent"');
    expect(selected).not.toContain('href="/p/project/tasks/child"');
    expect(selected).toContain('href="/p/project/tasks"');
    expect(selected).toContain('href="/ai?planning=milestone&amp;projectId=project&amp;milestoneId=milestone"');
  });

  it("搜索只定位子任务时，阶段模块和独立任务计数仍取完整阶段", () => {
    const extra = { ...tasks[0], id: "independent", title: "独立工作", parentTaskId: null };
    const fullGroup = buildMilestoneTaskGraph("project", [group.milestone!], [...tasks, extra]).groups[0];
    const filtered = { ...fullGroup, roots: filterMilestoneTree(fullGroup.roots, "研究附录") };
    const html = renderToStaticMarkup(createElement(MilestoneProcess, { projectId: "project", groups: [filtered], fullGroups: [fullGroup], query: "研究附录", taskById: new Map([...tasks, extra].map((task) => [task.id, task])), selectedId: "all", onSelect: vi.fn() }));
    expect(html).toContain("1 个模块 · 1 项任务");
    expect(html).toContain("0/3 项已验收");
    expect(html).toContain("搜索命中：");
    expect(html).toContain('href="/p/project/tasks/child"');
    expect(html).not.toContain('href="/p/project/tasks/independent"');
  });

  it("无子任务显示独立任务，跨阶段子项展示实际主任务入口", () => {
    const standalone = renderToStaticMarkup(createElement(MilestoneModuleCard, { node: { task: tasks[1], children: [], externalParent: null }, query: "", taskById }));
    expect(standalone).toContain("独立任务");
    expect(standalone).not.toContain("查看子任务");
    const external = renderToStaticMarkup(createElement(MilestoneModuleCard, { node: { task: tasks[1], children: [], externalParent: tasks[0] }, query: "", taskById }));
    expect(external).toContain("跨阶段子任务");
    expect(external).toContain("所属主任务");
    expect(external).toContain('href="/p/project/tasks/parent"');
  });

  it("具有创建权限时，阶段和任务末卡提供弹窗操作，无权限不展示", () => {
    const props = { projectId: "project", groups: [group], query: "", taskById, selectedId: "milestone", onSelect: vi.fn() };
    const readOnly = renderToStaticMarkup(createElement(MilestoneProcess, props));
    expect(readOnly).not.toContain("新建里程碑");
    expect(readOnly).not.toContain("新建模块 / 任务");
    const editable = renderToStaticMarkup(createElement(MilestoneProcess, { ...props, onCreateMilestone: vi.fn(), onCreateTask: vi.fn() }));
    expect(editable).toContain("新建里程碑");
    expect(editable).toContain("新建模块 / 任务");
    expect(editable).not.toContain("任务创建表单");
    expect(editable).not.toContain("新增子任务");
  });

  it("仅可拆分的顶层任务提供新增子任务末卡，待验收和已验收任务不展示", () => {
    const render = (task: MilestoneTask) => renderToStaticMarkup(createElement(MilestoneModuleCard, { node: { ...group.roots[0], task }, query: "课题", taskById, onCreateTask: vi.fn() }));
    expect(render(tasks[0])).toContain("新增子任务");
    expect(render({ ...tasks[0], status: "submitted" })).not.toContain("新增子任务");
    expect(render({ ...tasks[0], status: "accepted" })).not.toContain("新增子任务");
    expect(render({ ...tasks[0], parentTaskId: "other" })).not.toContain("新增子任务");
  });
});

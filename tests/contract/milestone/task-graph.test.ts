import { describe, expect, it } from "vitest";
import { buildMilestoneTaskGraph, dependencyLayers, filterMilestoneTree, milestonePlanningUrl, summarizeTaskBranch, UNGROUPED_MILESTONE, type MilestoneTask, type MilestoneSummary } from "@/modules/milestone/client";

const milestone = (id = "m1", projectId = "p1"): MilestoneSummary => ({ id, projectId, title: id, description: null, kind: "custom", status: "open", targetDate: "2026-11-01" });
const task = (id: string, patch: Partial<MilestoneTask> = {}): MilestoneTask => ({ id, projectId: "p1", milestoneId: "m1", parentTaskId: null, title: id, status: "unclaimed", assigneeName: null, startDate: null, dueDate: null, sortOrder: 0, blockedByIds: [], ...patch });

describe("里程碑任务树与依赖模型", () => {
  it("保留真实父子层级，并分别统计每项任务的验收状态", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("child", { parentTaskId: "parent", status: "accepted" }), task("parent")]);
    expect(graph.groups[0].roots.map((node) => node.task.id)).toEqual(["parent"]);
    expect(graph.groups[0].roots[0].children[0].task.id).toBe("child");
    expect(graph.groups[0]).toMatchObject({ total: 2, accepted: 1 });
    expect(graph.edges).toEqual([]);
  });

  it("跨里程碑子任务保留在自身分组，并标记真实父任务，不漏节点", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone(), milestone("m2")], [task("parent"), task("child", { parentTaskId: "parent", milestoneId: "m2" })]);
    expect(graph.groups.map((group) => group.total)).toEqual([1, 1]);
    expect(graph.groups[1].roots[0].externalParent?.id).toBe("parent");
    expect(graph.groups[0].roots[0].children).toEqual([]);
  });

  it("未关联任务单独显示，不能静默继承父任务的里程碑", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("parent"), task("child", { parentTaskId: "parent", milestoneId: null })]);
    expect(graph.groups[1].id).toBe(UNGROUPED_MILESTONE);
    expect(graph.groups[1].roots[0].task.id).toBe("child");
    expect(graph.groups[1].roots[0].externalParent?.id).toBe("parent");
  });

  it("只有真实 blockedByIds 产生有向边，跨里程碑与前置验收结果分别标记", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone(), milestone("m2")], [task("a", { status: "accepted" }), task("b", { milestoneId: "m2", blockedByIds: ["a", "a"] })]);
    expect(graph.edges).toEqual([{ from: "a", to: "b", crossMilestone: true, fulfilled: true }]);
    expect(dependencyLayers(graph.tasks, graph.edges).layers.map((layer) => layer.map((item) => item.id))).toEqual([["a"], ["b"]]);
  });

  it("无关联任务并列，汇合节点位于全部前置之后；日期和父子关系不产生虚构顺序", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("a", { dueDate: "2026-12-01" }), task("b", { parentTaskId: "a", dueDate: "2026-10-01" }), task("c", { blockedByIds: ["a", "b"] })]);
    expect(dependencyLayers(graph.tasks, graph.edges).layers.map((layer) => layer.map((item) => item.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("按当前项目构图，不能带入其他项目的任务、里程碑或连线", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone(), milestone("private", "p2")], [task("a", { blockedByIds: ["secret"] }), task("secret", { projectId: "p2", title: "保密内容" })]);
    expect(graph.tasks.map((item) => item.id)).toEqual(["a"]);
    expect(graph.groups.map((group) => group.id)).toEqual(["m1"]);
    expect(graph.edges).toEqual([]);
  });

  it("无任务和无里程碑时提供真实空分组，已有空里程碑仍保留", () => {
    expect(buildMilestoneTaskGraph("p1", [], []).groups).toMatchObject([{ id: UNGROUPED_MILESTONE, total: 0, accepted: 0, roots: [] }]);
    expect(buildMilestoneTaskGraph("p1", [milestone()], []).groups).toMatchObject([{ id: "m1", total: 0 }]);
  });

  it("搜索命中子任务时保留祖先上下文，搜索父任务时保留其子树", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("parent"), task("report", { title: "编写报告", parentTaskId: "parent", assigneeName: "张同学" }), task("other", { parentTaskId: "parent" })]);
    const filtered = filterMilestoneTree(graph.groups[0].roots, " 张同学 ");
    expect(filtered[0].task.id).toBe("parent");
    expect(filtered[0].children.map((child) => child.task.id)).toEqual(["report"]);
    expect(filterMilestoneTree(graph.groups[0].roots, "parent")[0].children).toHaveLength(2);
    expect(filterMilestoneTree(graph.groups[0].roots, "不存在")).toEqual([]);
  });

  it("规划入口携带项目与里程碑上下文，未分组只携带项目", () => {
    expect(milestonePlanningUrl("p1", "m1")).toBe("/ai?planning=milestone&projectId=p1&milestoneId=m1");
    expect(milestonePlanningUrl("p1", UNGROUPED_MILESTONE)).toBe("/ai?planning=milestone&projectId=p1");
  });

  it("异常循环关联不伪造顺序，显式返回受影响任务供界面提示与查阅", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("a", { blockedByIds: ["b"] }), task("b", { blockedByIds: ["a"] }), task("c")]);
    const layout = dependencyLayers(graph.tasks, graph.edges);
    expect(layout.layers.map((layer) => layer.map((item) => item.id))).toEqual([["c"]]);
    expect(layout.unresolved.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("阶段按目标日期排列而不产生执行箭头，无日期排在末尾", () => {
    const graph = buildMilestoneTaskGraph("p1", [{ ...milestone("later"), targetDate: "2026-12-01" }, { ...milestone("none"), targetDate: null }, { ...milestone("first"), targetDate: "2026-10-20" }], []);
    expect(graph.groups.map((group) => group.id)).toEqual(["first", "later", "none"]);
    expect(graph.edges).toEqual([]);
  });

  it("模块验收进度不把待验收当作完成，也不因主任务验收而推定子项状态", () => {
    const graph = buildMilestoneTaskGraph("p1", [milestone()], [task("module", { status: "accepted" }), task("first", { parentTaskId: "module", status: "accepted" }), task("second", { parentTaskId: "module", status: "submitted" })]);
    expect(summarizeTaskBranch(graph.groups[0].roots[0])).toEqual({ total: 3, accepted: 2, submitted: 1, percent: 67 });
  });
});

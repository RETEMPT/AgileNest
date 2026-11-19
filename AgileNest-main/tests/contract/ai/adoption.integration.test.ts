import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject } from "@/modules/identity";
import { createMilestone } from "@/modules/milestone";
import { getTaskDelivery, getTaskDetail, getTaskOrganization, listProjectTasks, transitionTask } from "@/modules/tasks";
import { applyTaskPlan } from "@/modules/ai/adoption";
import type { TaskPlan, TaskPlanNode } from "@/modules/ai/client";
import { makeFixture, resetDb } from "../../helpers";

const node = (id: string, patch: Partial<TaskPlanNode> = {}): TaskPlanNode => ({ id, title: `规划任务 ${id}`, criteria: ["交付结果可复现且通过逐项核验"], parentId: null, dependsOn: [], ...patch });
const plan = (...nodes: TaskPlanNode[]): TaskPlan => ({ version: 1, nodes });

describe("AI 规划采纳与任务公开契约真实集成", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fixture = await makeFixture(); });
  const request = (value: TaskPlan) => ({ projectId: fixture.project.id, runId: randomUUID(), plan: value });

  it("创建真实主子任务、验收要求和任务先后，全部保持待认领", async () => {
    const milestone = await createMilestone(fixture.admin.id, fixture.project.id, { title: "开题检查" });
    const value = { ...request(plan(node("report"), node("research"), node("evidence", { parentId: "report", dependsOn: ["research"] }))), milestoneId: milestone.id };
    const result = await applyTaskPlan(fixture.admin.id, value);
    expect(result.complete).toBe(true); expect(result.tasks).toHaveLength(3);
    const main = result.tasks.find((task) => task.nodeId === "report")!; const child = result.tasks.find((task) => task.nodeId === "evidence")!;
    expect(await getTaskDetail(fixture.admin.id, child.taskId)).toMatchObject({ parentTaskId: main.taskId, milestoneId: milestone.id, status: "unclaimed", assigneeId: null });
    expect((await getTaskDelivery(fixture.admin.id, child.taskId)).requirements.criteria[0].text).toBe("交付结果可复现且通过逐项核验");
    expect((await getTaskOrganization(fixture.admin.id, child.taskId)).blockedBy[0].task.id).toBe(result.tasks.find((task) => task.nodeId === "research")!.taskId);
  });
  it("完成后的同批重试不会重复创建任务和任务先后", async () => {
    const value = request(plan(node("a"), node("b", { dependsOn: ["a"] })));
    const first = await applyTaskPlan(fixture.admin.id, value); const second = await applyTaskPlan(fixture.admin.id, value);
    expect(second).toEqual(first); expect(await listProjectTasks(fixture.admin.id, fixture.project.id)).toHaveLength(2);
    expect((await getTaskOrganization(fixture.admin.id, first.tasks[1].taskId)).blockedBy).toHaveLength(1);
  });
  it("复用创建请求改写规划会返回409，已有任务保持原样", async () => {
    const value = request(plan(node("a"), node("b"))); await applyTaskPlan(fixture.admin.id, value);
    await expect(applyTaskPlan(fixture.admin.id, { ...value, plan: plan(node("a"), node("b", { title: "更改后的任务" })) })).rejects.toBeInstanceOf(ConflictError);
    expect((await listProjectTasks(fixture.admin.id, fixture.project.id)).map((task) => task.title)).toEqual(["规划任务 a", "规划任务 b"]);
  });
  it("无项目权限不能采纳，跨项目里程碑和缺验收要求均在创建前失败", async () => {
    await expect(applyTaskPlan(fixture.outsider.id, request(plan(node("a"))))).rejects.toBeInstanceOf(ForbiddenError);
    const another = await createProject(fixture.admin.id, fixture.team.id, { name: "另一个课题" });
    const foreign = await createMilestone(fixture.admin.id, another.id, { title: "其他项目节点" });
    await expect(applyTaskPlan(fixture.admin.id, { ...request(plan(node("a"))), milestoneId: foreign.id })).rejects.toThrow("当前项目");
    await expect(applyTaskPlan(fixture.admin.id, request(plan(node("a", { criteria: [] }))))).rejects.toBeInstanceOf(AppError);
    expect(await listProjectTasks(fixture.admin.id, fixture.project.id)).toHaveLength(0);
  });
  it("成员可以创建无顺序规划，不能借助AI绕过任务先后设置权限", async () => {
    const value = request(plan(node("a"), node("b", { dependsOn: ["a"] })));
    await expect(applyTaskPlan(fixture.student.id, value)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listProjectTasks(fixture.admin.id, fixture.project.id)).toHaveLength(0);
    const simple = await applyTaskPlan(fixture.student.id, request(plan(node("main"), node("child", { parentId: "main" }))));
    expect(simple.complete).toBe(true); expect(simple.tasks).toHaveLength(2);
  });
  it("任务开始执行后重试采纳返回409，不重置状态或负责人", async () => {
    const value = request(plan(node("a"))); const result = await applyTaskPlan(fixture.admin.id, value);
    const taskId = result.tasks[0].taskId; await transitionTask(fixture.student.id, taskId, "claim", {});
    await expect(applyTaskPlan(fixture.admin.id, value)).rejects.toBeInstanceOf(ConflictError);
    expect(await getTaskDetail(fixture.admin.id, taskId)).toMatchObject({ status: "in_progress", assigneeId: fixture.student.id });
  });
});

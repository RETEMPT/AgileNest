import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMilestone, listMilestones } from "@/modules/milestone";
import { createSubtask, createTask, getTaskDetail } from "@/modules/tasks";
import { createProject } from "@/modules/identity";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { submitEvidence } from "../../delivery-fixtures";

describe("里程碑卡片创建的持久化边界", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fixture = await makeFixture(); });

  it("同次里程碑创建并发和重试返回一个阶段，保留完整内容", async () => {
    const input = { title: "开题阶段", description: "明确研究问题", kind: "open_topic" as const, targetDate: "2026-11-01", requestKey: randomUUID() };
    const [first, second] = await Promise.all([createMilestone(fixture.admin.id, fixture.project.id, input), createMilestone(fixture.admin.id, fixture.project.id, input)]);
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({ title: input.title, description: input.description, kind: input.kind, targetDate: input.targetDate });
    expect(await listMilestones(fixture.admin.id, fixture.project.id)).toHaveLength(1);
    await expect(createMilestone(fixture.admin.id, fixture.project.id, { ...input, title: "改写已有阶段" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("成员和项目外账号不能创建里程碑，失败不产生阶段", async () => {
    for (const actor of [fixture.student.id, fixture.outsider.id]) await expect(createMilestone(actor, fixture.project.id, { title: "越权", requestKey: randomUUID() })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listMilestones(fixture.admin.id, fixture.project.id)).toHaveLength(0);
  });

  it("非法标题、日期和请求键返回可展示错误，不产生阶段", async () => {
    for (const patch of [{ title: " " }, { title: "x".repeat(201) }, { targetDate: "2026-02-30" }, { requestKey: "invalid" }]) await expect(createMilestone(fixture.admin.id, fixture.project.id, { title: "阶段", ...patch })).rejects.toBeInstanceOf(AppError);
    expect(await listMilestones(fixture.admin.id, fixture.project.id)).toHaveLength(0);
  });

  it("主任务和子任务按选中阶段创建，同次子任务重试不重复", async () => {
    const milestone = await createMilestone(fixture.teacher.id, fixture.project.id, { title: "阶段" });
    const parent = await createTask(fixture.student.id, fixture.project.id, { title: "工作模块", milestoneId: milestone.id });
    const input = { title: "子任务", milestoneId: milestone.id, requestKey: randomUUID(), acceptanceCriteria: [{ id: randomUUID(), text: "提交可核对的材料" }] };
    const child = await createSubtask(fixture.student.id, parent.id, input);
    const retry = await createSubtask(fixture.student.id, parent.id, input);
    expect(retry.id).toBe(child.id);
    expect(child).toMatchObject({ milestoneId: milestone.id, parentTaskId: parent.id, status: "unclaimed" });
    expect((await getTaskDetail(fixture.student.id, parent.id)).subtasks).toHaveLength(1);
  });

  it("不能借末卡选择其他项目阶段，也不能为子任务继续嵌套", async () => {
    const other = await createProject(fixture.admin.id, fixture.team.id, { name: "其他项目" });
    const milestone = await createMilestone(fixture.admin.id, other.id, { title: "其他阶段" });
    const parent = await createTask(fixture.student.id, fixture.project.id, { title: "主任务" });
    await expect(createSubtask(fixture.student.id, parent.id, { title: "跨项目阶段", milestoneId: milestone.id })).rejects.toBeInstanceOf(AppError);
    const child = await createSubtask(fixture.student.id, parent.id, { title: "子任务" });
    await expect(createSubtask(fixture.student.id, child.id, { title: "再嵌套" })).rejects.toBeInstanceOf(AppError);
  });

  it("父任务进入待验收后旧弹窗不能新增，原有子任务保持不变", async () => {
    const task = await createTask(fixture.admin.id, fixture.project.id, { title: "工作模块", assigneeId: fixture.student.id, acceptanceCriteria: [{ id: randomUUID(), text: "提供报告" }] });
    await submitEvidence(fixture.student.id, task.id, "报告已完成");
    await expect(createSubtask(fixture.student.id, task.id, { title: "旧弹窗新增", requestKey: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDetail(fixture.student.id, task.id)).subtasks).toHaveLength(0);
  });
});

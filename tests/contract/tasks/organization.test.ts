import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { taskDependencies, tasks, taskSubmissions, taskSubmissionReviews } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject, joinTeam } from "@/modules/identity";
import { availableTransitions, changeTaskOrganization, createProjectTaskLabel, createTask, deleteProjectTaskLabel, deleteTask, getTaskDelivery, getTaskDetail, getTaskOrganization, listProjectTaskLabels, listProjectTasks, transitionTask, updateProjectTaskLabel } from "@/modules/tasks";
import { listTaskEvents } from "@/modules/review";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("项目标签与任务依赖", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  async function work(title: string) { return createTask(fx.admin.id, fx.project.id, { title, assigneeId: fx.student.id }); }
  async function link(blockerTaskId: string, blockedTaskId: string, actorId = fx.admin.id) {
    const state = await getTaskOrganization(actorId, blockedTaskId);
    return changeTaskOrganization(actorId, blockedTaskId, { op: "addDependency", version: state.version, direction: "blockedBy", otherTaskId: blockerTaskId });
  }
  async function accepted(title: string) {
    const task = await work(title); await submitEvidence(fx.student.id, task.id, `${title}已完成`); await reviewEvidence(fx.teacher.id, task.id, "accept", "核对通过"); return task;
  }

  it("有指派权限管理标签，名称忽略大小写防重复，修改和删除校验版本", async () => {
    const label = await createProjectTaskLabel(fx.admin.id, fx.project.id, { name: "  Frontend  ", color: "cyan" });
    expect(label).toMatchObject({ name: "Frontend", color: "cyan", version: 1 });
    await expect(createProjectTaskLabel(fx.admin.id, fx.project.id, { name: "frontend" })).rejects.toBeInstanceOf(ConflictError);
    await expect(createProjectTaskLabel(fx.student.id, fx.project.id, { name: "越权" })).rejects.toBeInstanceOf(ForbiddenError);
    const updated = await updateProjectTaskLabel(fx.teacher.id, fx.project.id, label.id, { name: "前端", color: "green", version: 1 });
    expect(updated.version).toBe(2);
    await expect(updateProjectTaskLabel(fx.admin.id, fx.project.id, label.id, { name: "陈旧", version: 1 })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteProjectTaskLabel(fx.admin.id, fx.project.id, label.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(listProjectTaskLabels(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("负责人设置标签，批量任务DTO与统一筛选一致，删除标签移除关联并提升版本", async () => {
    const a = await work("A"); const b = await work("B");
    const label = await createProjectTaskLabel(fx.admin.id, fx.project.id, { name: "设计", color: "violet" });
    const changed = await changeTaskOrganization(fx.student.id, a.id, { op: "labels", version: 1, labelIds: [label.id] });
    expect(changed).toMatchObject({ version: 2, labels: [expect.objectContaining({ id: label.id })] });
    expect((await listProjectTasks(fx.student.id, fx.project.id, { labelId: label.id })).map((task) => task.id)).toEqual([a.id]);
    expect((await getTaskDetail(fx.student.id, b.id)).labels).toEqual([]);
    await deleteProjectTaskLabel(fx.admin.id, fx.project.id, label.id, label.version);
    expect((await getTaskOrganization(fx.student.id, a.id))).toMatchObject({ version: 3, labels: [] });
  });

  it("其他执行成员不能调整别人的任务，跨项目标签不接受", async () => {
    await joinTeam(fx.outsider.id, fx.team.inviteCode);
    const task = await work("负责人任务");
    await expect(changeTaskOrganization(fx.outsider.id, task.id, { op: "labels", version: 1, labelIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
    const project = await createProject(fx.admin.id, fx.team.id, { name: "其他课题" });
    const label = await createProjectTaskLabel(fx.admin.id, project.id, { name: "其他项目标签" });
    await expect(changeTaskOrganization(fx.student.id, task.id, { op: "labels", version: 1, labelIds: [label.id] })).rejects.toBeInstanceOf(AppError);
    expect((await getTaskOrganization(fx.student.id, task.id)).version).toBe(1);
  });

  it("双向依赖、阻塞和按钮来自同一份数据", async () => {
    const a = await work("前置任务"); const b = await work("后续任务");
    const changed = await link(a.id, b.id, fx.student.id);
    expect(changed.blockedBy).toEqual([expect.objectContaining({ task: expect.objectContaining({ id: a.id }) })]);
    expect((await getTaskOrganization(fx.admin.id, a.id)).blocking[0].task.id).toBe(b.id);
    const detail = await getTaskDetail(fx.student.id, b.id);
    expect(detail).toMatchObject({ blocked: true, blockedByIds: [a.id] });
    expect(availableTransitions(detail, "student", fx.student.id).map((rule) => rule.action)).not.toContain("submit");
    expect((await listProjectTasks(fx.admin.id, fx.project.id, { blocked: true })).map((task) => task.id)).toEqual([b.id]);
  });

  it("拒绝自身、间接循环和跨项目关系且不新增事件", async () => {
    const a = await work("A"); const b = await work("B"); const c = await work("C");
    await expect(link(a.id, a.id)).rejects.toBeInstanceOf(ConflictError);
    await link(a.id, b.id); await link(b.id, c.id);
    const before = await listTaskEvents(fx.admin.id, a.id);
    await expect(link(c.id, a.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await listTaskEvents(fx.admin.id, a.id)).toEqual(before);
    const project = await createProject(fx.admin.id, fx.team.id, { name: "另一项目" });
    const foreign = await createTask(fx.admin.id, project.id, { title: "不能跨项目" });
    await expect(link(foreign.id, a.id)).rejects.toBeInstanceOf(AppError);
    expect(await db.select().from(taskDependencies)).toHaveLength(2);
  });

  it("并发相反依赖至多一个成功，项目图不会循环", async () => {
    const a = await work("A"); const b = await work("B");
    const results = await Promise.allSettled([
      changeTaskOrganization(fx.admin.id, a.id, { op: "addDependency", version: 1, otherTaskId: b.id, direction: "blockedBy" }),
      changeTaskOrganization(fx.admin.id, b.id, { op: "addDependency", version: 1, otherTaskId: a.id, direction: "blockedBy" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(taskDependencies)).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("陈旧版本不覆盖标签或依赖，取消不发请求即可保留原设置", async () => {
    const task = await work("A");
    const first = await createProjectTaskLabel(fx.admin.id, fx.project.id, { name: "前端" });
    const second = await createProjectTaskLabel(fx.admin.id, fx.project.id, { name: "后端" });
    await changeTaskOrganization(fx.student.id, task.id, { op: "labels", version: 1, labelIds: [first.id] });
    await expect(changeTaskOrganization(fx.student.id, task.id, { op: "labels", version: 1, labelIds: [second.id] })).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskOrganization(fx.student.id, task.id)).labels.map((label) => label.id)).toEqual([first.id]);
  });

  it("未验收前置任务阻止提交，不写成果版本或流转事件，完成后自动解除阻塞", async () => {
    const a = await work("前置"); const b = await work("后续"); await link(a.id, b.id);
    await expect(submitEvidence(fx.student.id, b.id, "后续已完成")).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDelivery(fx.student.id, b.id)).submissions).toEqual([]);
    expect((await listTaskEvents(fx.admin.id, b.id)).filter((event) => event.action === "submit")).toEqual([]);
    await submitEvidence(fx.student.id, a.id, "前置已完成"); await reviewEvidence(fx.teacher.id, a.id, "accept", "验收通过");
    expect((await getTaskDetail(fx.student.id, b.id)).blocked).toBe(false);
    await submitEvidence(fx.student.id, b.id, "后续已完成");
    expect((await getTaskDetail(fx.student.id, b.id)).status).toBe("submitted");
  });

  it("后续已待验收或完成时禁止重开前置，解除依赖后可以重开", async () => {
    const a = await accepted("前置"); const b = await work("后续"); await link(a.id, b.id); await submitEvidence(fx.student.id, b.id, "后续已完成");
    await expect(transitionTask(fx.teacher.id, a.id, "reopen")).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDetail(fx.admin.id, a.id)).reopenBlocked).toBe(true);
    await reviewEvidence(fx.teacher.id, b.id, "accept", "通过");
    await expect(transitionTask(fx.teacher.id, a.id, "reopen")).rejects.toBeInstanceOf(ConflictError);
    const state = await getTaskOrganization(fx.admin.id, b.id);
    await changeTaskOrganization(fx.admin.id, b.id, { op: "removeDependency", version: state.version, dependencyId: state.blockedBy[0].id });
    expect((await transitionTask(fx.teacher.id, a.id, "reopen")).status).toBe("in_progress");
  });

  it("不向待验收与完成任务偷偷添加未完成前置", async () => {
    const a = await work("未完成前置"); const b = await work("后续"); await submitEvidence(fx.student.id, b.id, "提交成果");
    await expect(link(a.id, b.id)).rejects.toBeInstanceOf(ConflictError);
    await reviewEvidence(fx.teacher.id, b.id, "accept", "通过");
    await expect(link(a.id, b.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(taskDependencies)).toEqual([]);
  });

  it("删除任务及父任务不能绕过子任务依赖，未触及原提交历史", async () => {
    const parent = await work("父任务"); const child = await createTask(fx.admin.id, fx.project.id, { title: "子任务", parentTaskId: parent.id });
    const blocker = await work("前置"); await link(blocker.id, child.id);
    await expect(deleteTask(fx.admin.id, parent.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteTask(fx.admin.id, blocker.id)).rejects.toBeInstanceOf(ConflictError);
    const state = await getTaskOrganization(fx.admin.id, child.id);
    await changeTaskOrganization(fx.admin.id, child.id, { op: "removeDependency", version: state.version, dependencyId: state.blockedBy[0].id });
    await deleteTask(fx.admin.id, parent.id);
    expect(await db.select().from(tasks).where(and(eq(tasks.projectId, fx.project.id), eq(tasks.id, child.id)))).toEqual([]);
  });

  it("既有异常阻塞任务的accept/resubmit也回滚，不伪造评审或新版本", async () => {
    const a = await accepted("前置"); const b = await work("后续"); await link(a.id, b.id); await submitEvidence(fx.student.id, b.id, "后续成果");
    // 模拟迁移前产生的不一致状态，生产代码依旧只通过 transitionTask。
    await db.update(tasks).set({ status: "in_progress" }).where(eq(tasks.id, a.id));
    await expect(reviewEvidence(fx.teacher.id, b.id, "accept", "通过")).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(taskSubmissionReviews)).toHaveLength(1);
    await reviewEvidence(fx.teacher.id, b.id, "reject", "请补验证");
    await expect(submitEvidence(fx.student.id, b.id, "修改完成", "resubmit")).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(taskSubmissions).where(eq(taskSubmissions.taskId, b.id))).toHaveLength(1);
    expect((await getTaskDetail(fx.admin.id, b.id)).status).toBe("rejected");
  });

  it("没有依赖的旧任务流转及项目成员查看保持兼容", async () => {
    const task = await work("普通任务"); await submitEvidence(fx.student.id, task.id, "完成"); await reviewEvidence(fx.teacher.id, task.id, "accept", "通过");
    expect((await getTaskDetail(fx.student.id, task.id))).toMatchObject({ status: "accepted", labels: [], blockedByIds: [], blockingIds: [], blocked: false });
    await expect(getTaskOrganization(fx.outsider.id, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeTaskOrganization(fx.student.id, task.id, { op: "removeDependency", version: 1, dependencyId: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
  });
});

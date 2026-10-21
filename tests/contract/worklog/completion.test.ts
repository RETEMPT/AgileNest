import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { worklogs } from "@/db/schema";
import { addWorklog, projectCompletion, completionRatio, memberContribution, deleteWorklog, taskHours, listWorklogs } from "@/modules/worklog";
import { createTask, createSubtask, transitionTask } from "@/modules/tasks";
import { saveAcademicProfile, updateMemberPositions } from "@/modules/identity";
import { ConflictError, ForbiddenError, todayISO } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("任务贡献与工时归档", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  async function assigned(title: string, dueDate?: string) {
    return createTask(fx.student.id, fx.project.id, { title, assigneeId: fx.student.id, dueDate });
  }

  it("空项目完成率为零，零任务成员仍显示", async () => {
    expect(await projectCompletion(fx.student.id, fx.project.id)).toMatchObject({ done: 0, total: 0, ratio: 0 });
    const members = await memberContribution(fx.admin.id, fx.project.id);
    expect(members).toHaveLength(3);
    expect(members.every((member) => member.tasksTotal === 0 && member.completionRatio === 0 && member.tasks.length === 0)).toBe(true);
  });

  it("子任务验收不提前算父任务已完成，个人按实际负责任务统计", async () => {
    const parent = await assigned("父任务");
    const sub = await createSubtask(fx.student.id, parent.id, { title: "子任务" });
    await transitionTask(fx.student.id, sub.id, "claim");
    await submitEvidence(fx.student.id, sub.id, "完成");
    await reviewEvidence(fx.teacher.id, sub.id);
    expect((await completionRatio(fx.student.id, parent.id)).ratio).toBe(1);
    expect((await projectCompletion(fx.student.id, fx.project.id)).ratio).toBe(0);
    expect((await memberContribution(fx.student.id, fx.project.id))[0]).toMatchObject({ tasksTotal: 2, tasksAccepted: 1, completionRatio: 0.5 });
    await submitEvidence(fx.student.id, parent.id, "整体完成");
    await reviewEvidence(fx.teacher.id, parent.id);
    expect(await projectCompletion(fx.student.id, fx.project.id)).toMatchObject({ done: 1, total: 1, ratio: 1 });
    expect((await memberContribution(fx.student.id, fx.project.id))[0]).toMatchObject({ tasksTotal: 2, tasksAccepted: 2, completionRatio: 1 });
  });

  it("统计当前五态、待验收和逾期，已验收与今日到期不算逾期", async () => {
    const active = await assigned("逾期进行中", "2020-01-01");
    const pending = await assigned("今日待验收", todayISO());
    const accepted = await assigned("已验收", "2020-01-01");
    const rejected = await assigned("待修改", "2020-01-01");
    await createTask(fx.admin.id, fx.project.id, { title: "未认领" });
    await submitEvidence(fx.student.id, pending.id, "提交");
    await submitEvidence(fx.student.id, accepted.id, "提交");
    await reviewEvidence(fx.teacher.id, accepted.id);
    await submitEvidence(fx.student.id, rejected.id, "提交");
    await reviewEvidence(fx.teacher.id, rejected.id, "reject", "请补齐证明");
    const [member] = await memberContribution(fx.student.id, fx.project.id);
    expect(member).toMatchObject({ tasksTotal: 4, tasksAccepted: 1, tasksSubmitted: 1, completionRatio: 0.25, overdue: 2,
      statusCounts: { unclaimed: 0, in_progress: 1, submitted: 1, accepted: 1, rejected: 1 } });
    expect(member.tasks.map((task) => task.id)).toEqual([active.id, pending.id, accepted.id, rejected.id]);
    expect(member.tasks[0]).toMatchObject({ title: "逾期进行中", dueDate: "2020-01-01", status: "in_progress" });
    expect(member).not.toHaveProperty("minutes");
  });

  it.each(["admin", "teacher"] as const)("%s 可查看全体成员的任务统计", async (role) => {
    await assigned("成员工作");
    const members = await memberContribution(fx[role].id, fx.project.id);
    expect(members).toHaveLength(3);
    expect(members.find((member) => member.userId === fx.student.id)?.tasks).toHaveLength(1);
  });

  it("副管理员按职务可看全员", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["deputy"]);
    expect(await memberContribution(fx.student.id, fx.project.id)).toHaveLength(3);
  });

  it("普通成员仅本人，学术教师身份不增加贡献权限", async () => {
    await saveAcademicProfile(fx.student.id, { identity: "teacher" });
    await createTask(fx.admin.id, fx.project.id, { title: "管理员工作", assigneeId: fx.admin.id });
    const result = await memberContribution(fx.student.id, fx.project.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userId: fx.student.id, tasksTotal: 0, tasks: [] });
  });

  it("非成员不能读贡献、项目完成度或历史工时统计", async () => {
    await expect(memberContribution(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(projectCompletion(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskHours(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("非法验收转移被拒绝后贡献数据不变", async () => {
    const task = await assigned("进行中");
    await expect(transitionTask(fx.teacher.id, task.id, "accept")).rejects.toBeInstanceOf(ConflictError);
    expect((await memberContribution(fx.student.id, fx.project.id))[0]).toMatchObject({ tasksAccepted: 0, tasksTotal: 1, completionRatio: 0 });
  });

  it("负责人也无法登记工时，原始历史记录可读且无法删除", async () => {
    const task = await assigned("历史工作");
    const [log] = await db.insert(worklogs).values({ taskId: task.id, userId: fx.student.id, workDate: "2026-10-03", minutes: 90 }).returning();
    await expect(addWorklog(fx.student.id, task.id, { workDate: "2026-10-04", minutes: 30 })).rejects.toMatchObject({ status: 410 });
    await expect(deleteWorklog(fx.admin.id, log.id)).rejects.toMatchObject({ status: 410 });
    expect(await listWorklogs(fx.student.id, task.id)).toHaveLength(1);
    expect((await taskHours(fx.admin.id, fx.project.id))[0].minutes).toBe(90);
    await expect(listWorklogs(fx.outsider.id, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addWorklog(fx.outsider.id, task.id, { workDate: "2026-10-04", minutes: 30 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

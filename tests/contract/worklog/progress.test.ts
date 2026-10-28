import { beforeEach, describe, expect, it } from "vitest";
import { createMilestone } from "@/modules/milestone";
import { createSubtask, createTask, transitionTask } from "@/modules/tasks";
import { projectProgress } from "@/modules/worklog";
import { ForbiddenError, todayISO } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("项目进度汇总", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  async function assigned(title: string, milestoneId?: string, dueDate?: string) {
    return createTask(fx.student.id, fx.project.id, {
      title,
      assigneeId: fx.student.id,
      milestoneId,
      dueDate,
    });
  }

  it("空项目返回完整空结构，不伪造完成率", async () => {
    const progress = await projectProgress(fx.student.id, fx.project.id);
    expect(progress).toMatchObject({
      total: 0,
      accepted: 0,
      ratio: 0,
      active: 0,
      overdue: 0,
      attention: 0,
      subtaskTotal: 0,
      subtaskAccepted: 0,
      milestones: [],
      risks: [],
    });
    expect(progress.statusCounts).toEqual({ unclaimed: 0, in_progress: 0, submitted: 0, accepted: 0, rejected: 0 });
    expect(progress.weeks).toHaveLength(8);
    expect(progress.weeks.every((week) => week.count === 0)).toBe(true);
  });

  it("按顶层验收统计完成率，并分别汇总里程碑、子任务、风险与周趋势", async () => {
    const milestone = await createMilestone(fx.admin.id, fx.project.id, {
      title: "阶段一",
      targetDate: "2026-11-30",
    });
    const active = await assigned("逾期进行中", milestone.id, "2020-01-01");
    const pending = await assigned("今日待验收", milestone.id, todayISO());
    const accepted = await assigned("已验收", milestone.id, "2020-01-01");
    const rejected = await assigned("待修改", milestone.id, "2020-01-01");
    const unclaimed = await createTask(fx.admin.id, fx.project.id, { title: "未认领" });

    const subtask = await createSubtask(fx.student.id, accepted.id, { title: "验收材料" });
    await transitionTask(fx.student.id, subtask.id, "claim");
    await submitEvidence(fx.student.id, subtask.id, "完成");
    await reviewEvidence(fx.teacher.id, subtask.id);

    await submitEvidence(fx.student.id, pending.id, "提交");
    await submitEvidence(fx.student.id, accepted.id, "提交");
    await reviewEvidence(fx.teacher.id, accepted.id);
    await submitEvidence(fx.student.id, rejected.id, "提交");
    await reviewEvidence(fx.teacher.id, rejected.id, "reject", "请补齐证明");

    const progress = await projectProgress(fx.admin.id, fx.project.id);
    expect(progress.total).toBe(5);
    expect(progress.accepted).toBe(1);
    expect(progress.ratio).toBe(0.2);
    expect(progress.active).toBe(2);
    expect(progress.statusCounts).toEqual({ unclaimed: 1, in_progress: 1, submitted: 1, accepted: 1, rejected: 1 });
    expect(progress.overdue).toBe(2);
    expect(progress.attention).toBe(2);
    expect(progress.subtaskTotal).toBe(1);
    expect(progress.subtaskAccepted).toBe(1);
    expect(progress.risks.map((task) => task.id).sort()).toEqual([active.id, rejected.id].sort());
    expect(progress.milestones).toHaveLength(2);
    expect(progress.milestones[0]).toMatchObject({
      id: milestone.id,
      accepted: 1,
      total: 4,
      overdue: 2,
    });
    expect(progress.milestones[1]).toMatchObject({
      id: null,
      title: "未关联里程碑",
      accepted: 0,
      total: 1,
    });
    expect(progress.weeks[progress.weeks.length - 1].count).toBe(1);
    expect(unclaimed.id).toBeTruthy();
  });

  it("非项目成员无法读取项目进度", async () => {
    await expect(projectProgress(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

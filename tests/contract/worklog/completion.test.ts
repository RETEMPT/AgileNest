import { beforeEach, describe, expect, it } from "vitest";
import {
  addWorklog,
  projectCompletion,
  completionRatio,
  memberContribution,
  deleteWorklog,
  taskHours,
} from "@/modules/worklog";
import { createTask, createSubtask, transitionTask, listProjectTasks } from "@/modules/tasks";
import { AppError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("验收口径与工时", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("空项目完成率为零", async () => {
    expect(await projectCompletion(fx.student.id, fx.project.id)).toMatchObject(
      { done: 0, total: 0, ratio: 0 },
    );
  });
  it("子任务全部完成也不提前算父任务已验收", async () => {
    const parent = await createTask(fx.student.id, fx.project.id, {
      title: "父",
      assigneeId: fx.student.id,
    });
    const sub = await createSubtask(fx.student.id, parent.id, { title: "子" });
    await transitionTask(fx.student.id, sub.id, "claim");
    await submitEvidence(fx.student.id, sub.id, "完成");
    await reviewEvidence(fx.teacher.id, sub.id);
    expect((await completionRatio(fx.student.id, parent.id)).ratio).toBe(1);
    expect((await projectCompletion(fx.student.id, fx.project.id)).ratio).toBe(
      0,
    );
    await submitEvidence(fx.student.id, parent.id, "整体完成");
    await reviewEvidence(fx.teacher.id, parent.id);
    expect(await projectCompletion(fx.student.id, fx.project.id)).toMatchObject(
      { done: 1, total: 1, ratio: 1 },
    );
  });
  it("未认领或非本人任务不能记工时", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "任务",
    });
    await expect(
      addWorklog(fx.student.id, task.id, {
        minutes: 30,
        workDate: "2026-10-03",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await transitionTask(fx.student.id, task.id, "claim");
    await expect(
      addWorklog(fx.teacher.id, task.id, {
        minutes: 30,
        workDate: "2026-10-03",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("负责人记录真实工时并更新贡献", async () => {
    const task = await createTask(fx.student.id, fx.project.id, {
      title: "任务",
      assigneeId: fx.student.id,
    });
    await addWorklog(fx.student.id, task.id, {
      minutes: 90,
      workDate: "2026-10-03",
    });
    expect(
      (await memberContribution(fx.admin.id, fx.project.id)).find(
        (m) => m.userId === fx.student.id,
      )?.minutes,
    ).toBe(90);
  });
  it("拒绝非法日期和超过24小时的工时", async () => {
    const task = await createTask(fx.student.id, fx.project.id, {
      title: "任务",
      assigneeId: fx.student.id,
    });
    await expect(
      addWorklog(fx.student.id, task.id, {
        minutes: 30,
        workDate: "2026-02-30",
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      addWorklog(fx.student.id, task.id, {
        minutes: 1441,
        workDate: "2026-10-03",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
  it("非成员不能读统计，其他成员不能删除工时", async () => {
    const task = await createTask(fx.student.id, fx.project.id, {
      title: "任务",
      assigneeId: fx.student.id,
    });
    const log = await addWorklog(fx.student.id, task.id, {
      minutes: 30,
      workDate: "2026-10-03",
    });
    await expect(
      projectCompletion(fx.outsider.id, fx.project.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteWorklog(fx.teacher.id, log.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(taskHours(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memberContribution(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("完成度的分子分母与顶层任务下钻一致，子任务工时只累计一次", async () => {
    const parent = await createTask(fx.student.id, fx.project.id, {
      title: "已交付工作",
      assigneeId: fx.student.id,
    });
    const remaining = await createTask(fx.student.id, fx.project.id, { title: "下一项工作" });
    const child = await createSubtask(fx.student.id, parent.id, { title: "边界验证" });
    await transitionTask(fx.student.id, child.id, "claim");
    await addWorklog(fx.student.id, parent.id, { minutes: 90, workDate: "2026-10-10" });
    await addWorklog(fx.student.id, child.id, { minutes: 45, workDate: "2026-10-10" });
    await submitEvidence(fx.student.id, child.id, "边界已验证");
    await reviewEvidence(fx.teacher.id, child.id);
    await submitEvidence(fx.student.id, parent.id, "整体交付");
    await reviewEvidence(fx.teacher.id, parent.id);
    const completion = await projectCompletion(fx.student.id, fx.project.id);
    const topLevel = await listProjectTasks(fx.student.id, fx.project.id, { parentTaskId: null });
    expect(completion).toMatchObject({ done: 1, total: 2, ratio: 0.5 });
    expect(topLevel.map((task) => task.id)).toEqual([parent.id, remaining.id]);
    expect(topLevel.filter((task) => task.status === "accepted")).toHaveLength(completion.done);
    expect((await taskHours(fx.student.id, fx.project.id)).reduce((sum, member) => sum + member.minutes, 0)).toBe(135);
    expect((await memberContribution(fx.student.id, fx.project.id)).find((member) => member.userId === fx.student.id)).toMatchObject({ tasksAccepted: 2, tasksSubmitted: 2, minutes: 135 });
  });
});

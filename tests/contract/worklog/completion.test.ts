import { beforeEach, describe, expect, it } from "vitest";
import {
  addWorklog,
  projectCompletion,
  completionRatio,
  memberContribution,
  deleteWorklog,
} from "@/modules/worklog";
import { createTask, createSubtask, transitionTask } from "@/modules/tasks";
import { AppError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

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
    await transitionTask(fx.student.id, sub.id, "submit", { note: "完成" });
    await transitionTask(fx.teacher.id, sub.id, "accept");
    expect((await completionRatio(fx.student.id, parent.id)).ratio).toBe(1);
    expect((await projectCompletion(fx.student.id, fx.project.id)).ratio).toBe(
      0,
    );
    await transitionTask(fx.student.id, parent.id, "submit", {
      note: "整体完成",
    });
    await transitionTask(fx.teacher.id, parent.id, "accept");
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
  });
});

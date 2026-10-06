import { beforeEach, describe, expect, it } from "vitest";
import {
  createTask,
  createSubtask,
  updateTask,
  getTaskDetail,
  transitionTask,
} from "@/modules/tasks";
import { createProject } from "@/modules/identity";
import { createMilestone } from "@/modules/milestone";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("任务编辑和拆分", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("完整编辑后保留状态与负责人", async () => {
    const t = await createTask(fx.student.id, fx.project.id, {
      title: "初稿",
      assigneeId: fx.student.id,
    });
    const m = await createMilestone(fx.teacher.id, fx.project.id, {
      title: "开题",
    });
    const result = await updateTask(fx.student.id, t.id, {
      title: " 报告 ",
      description: "验收要求",
      startDate: "2026-10-01",
      dueDate: "2026-10-03",
      estimatedMinutes: 90,
      priority: "high",
      milestoneId: m.id,
    });
    expect(result).toMatchObject({
      title: "报告",
      status: "in_progress",
      assigneeId: fx.student.id,
      estimatedMinutes: 90,
      milestoneId: m.id,
    });
  });
  it("拒绝空标题、负工时与倒置日期", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, {
      title: "原任务",
      startDate: "2026-10-03",
    });
    for (const patch of [
      { title: " " },
      { estimatedMinutes: -1 },
      { dueDate: "2026-10-01" },
    ])
      await expect(updateTask(fx.admin.id, t.id, patch)).rejects.toBeInstanceOf(
        AppError,
      );
    expect((await getTaskDetail(fx.admin.id, t.id)).title).toBe("原任务");
  });
  it("跨项目里程碑和父任务不能关联", async () => {
    const p = await createProject(fx.admin.id, fx.team.id, {
      name: "其他项目",
    });
    const m = await createMilestone(fx.admin.id, p.id, { title: "外部" });
    const parent = await createTask(fx.admin.id, p.id, { title: "外部父任务" });
    for (const input of [{ milestoneId: m.id }, { parentTaskId: parent.id }])
      await expect(
        createTask(fx.admin.id, fx.project.id, { title: "越界", ...input }),
      ).rejects.toBeInstanceOf(AppError);
  });
  it("非成员不能编辑和拆分", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, { title: "任务" });
    await expect(
      updateTask(fx.outsider.id, t.id, { title: "恶意修改" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createSubtask(fx.outsider.id, t.id, { title: "越权" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("直接创建接口也不能绕过两层结构或构造环", async () => {
    const root = await createTask(fx.admin.id, fx.project.id, { title: "根" });
    const child = await createSubtask(fx.admin.id, root.id, {
      title: "子",
      priority: "high",
    });
    expect(child.priority).toBe("high");
    await expect(
      createTask(fx.admin.id, fx.project.id, {
        title: "孙",
        parentTaskId: child.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateTask(fx.admin.id, root.id, { parentTaskId: child.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("父任务验收等待全部子任务，完成后不能追加或直接重开子任务", async () => {
    const root = await createTask(fx.student.id, fx.project.id, {
      title: "父",
      assigneeId: fx.student.id,
    });
    const child = await createSubtask(fx.student.id, root.id, { title: "子" });
    await transitionTask(fx.student.id, root.id, "submit", { note: "请验收" });
    await expect(
      transitionTask(fx.teacher.id, root.id, "accept"),
    ).rejects.toBeInstanceOf(ConflictError);
    await transitionTask(fx.student.id, child.id, "claim");
    await transitionTask(fx.student.id, child.id, "submit", { note: "完成" });
    await transitionTask(fx.teacher.id, child.id, "accept");
    await transitionTask(fx.teacher.id, root.id, "accept");
    await expect(
      createSubtask(fx.admin.id, root.id, { title: "追加" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      transitionTask(fx.teacher.id, child.id, "reopen"),
    ).rejects.toBeInstanceOf(ConflictError);
    await transitionTask(fx.teacher.id, root.id, "reopen");
    await transitionTask(fx.teacher.id, child.id, "reopen");
    expect((await getTaskDetail(fx.student.id, root.id)).status).toBe(
      "in_progress",
    );
  });
});

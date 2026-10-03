import { beforeEach, describe, expect, it } from "vitest";
import { moveTask } from "@/modules/board";
import { createTask, getTaskDetail } from "@/modules/tasks";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { listTaskEvents } from "@/modules/review";
import { makeFixture, resetDb } from "../../helpers";

describe("看板状态移动", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("认领 → 带成果说明提交 → 教师验收", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "看板主链路",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    const submitted = await moveTask(fx.student.id, task.id, {
      status: "submitted",
      note: "成果已完成",
    });
    expect(submitted.completionNote).toBe("成果已完成");
    expect(
      (await moveTask(fx.teacher.id, task.id, { status: "accepted" })).status,
    ).toBe("accepted");
    expect(
      (await listTaskEvents(fx.admin.id, task.id)).map((event) => event.action),
    ).toEqual(["create", "claim", "submit", "accept"]);
  });
  it("缺少说明不能移动，保持原列", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "需要说明",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    await expect(
      moveTask(fx.student.id, task.id, { status: "submitted" }),
    ).rejects.toBeInstanceOf(AppError);
    expect((await getTaskDetail(fx.student.id, task.id)).status).toBe(
      "in_progress",
    );
  });
  it("不能跨过待验收直接完成", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "非法路径",
    });
    await expect(
      moveTask(fx.admin.id, task.id, { status: "accepted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("非成员不能移动", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "越权",
    });
    await expect(
      moveTask(fx.outsider.id, task.id, { status: "in_progress" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("学生不能通过看板验收", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "角色限制",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    await moveTask(fx.student.id, task.id, {
      status: "submitted",
      note: "完成",
    });
    await expect(
      moveTask(fx.student.id, task.id, { status: "accepted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("状态与属性组合不会丢弃一半修改", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "混合操作",
    });
    await expect(
      moveTask(fx.admin.id, task.id, {
        status: "in_progress",
        priority: "high",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await getTaskDetail(fx.admin.id, task.id)).toMatchObject({
      status: "unclaimed",
      priority: "medium",
    });
  });
  it("带修改意见打回并重新提交", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "看板反馈循环",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    await moveTask(fx.student.id, task.id, {
      status: "submitted",
      note: "初稿",
    });
    expect(
      (
        await moveTask(fx.teacher.id, task.id, {
          status: "rejected",
          note: "补验证",
        })
      ).rejectReason,
    ).toBe("补验证");
    expect(
      (
        await moveTask(fx.student.id, task.id, {
          status: "submitted",
          note: "已补验证",
        })
      ).status,
    ).toBe("submitted");
  });
});

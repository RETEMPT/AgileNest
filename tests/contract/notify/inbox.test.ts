import { beforeEach, describe, expect, it } from "vitest";
import { listMyNotifications, markRead } from "@/modules/notify";
import { createTask, transitionTask } from "@/modules/tasks";
import { NotFoundError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("协作消息中心", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  async function assigned() {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "课题任务",
      assigneeId: fx.student.id,
    });
    return task;
  }
  it("新账号消息为空", async () => {
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
  });
  it("指派通知指向对应任务", async () => {
    const task = await assigned();
    const messages = await listMyNotifications(fx.student.id);
    expect(messages[0].link).toBe(`/p/${fx.project.id}/tasks/${task.id}`);
    expect(messages[0].readAt).toBeNull();
  });
  it("消息仅对收件人可见", async () => {
    await assigned();
    expect(await listMyNotifications(fx.outsider.id)).toEqual([]);
  });
  it("本人标为已读后从未读列表移除", async () => {
    await assigned();
    const [note] = await listMyNotifications(fx.student.id);
    await markRead(fx.student.id, note.id);
    expect(
      await listMyNotifications(fx.student.id, { unreadOnly: true }),
    ).toEqual([]);
    expect((await listMyNotifications(fx.student.id))[0].readAt).not.toBeNull();
  });
  it("不能将他人消息标为已读", async () => {
    await assigned();
    const [note] = await listMyNotifications(fx.student.id);
    await expect(markRead(fx.outsider.id, note.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await listMyNotifications(fx.student.id))[0].readAt).toBeNull();
  });
  it("提交与打回通知保留对应成果和反馈", async () => {
    const task = await assigned();
    await transitionTask(fx.student.id, task.id, "submit", {
      note: "完成分析",
    });
    expect(
      (await listMyNotifications(fx.teacher.id)).some(
        (n) => n.type === "task_submitted",
      ),
    ).toBe(true);
    await transitionTask(fx.teacher.id, task.id, "reject", {
      note: "补充实验结论",
    });
    expect(
      (await listMyNotifications(fx.student.id)).some(
        (n) => n.type === "task_rejected" && n.body?.includes("补充实验结论"),
      ),
    ).toBe(true);
  });
});

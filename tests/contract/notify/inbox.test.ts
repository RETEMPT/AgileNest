import { beforeEach, describe, expect, it } from "vitest";
import { listMyNotifications, markRead } from "@/modules/notify";
import { createTask, transitionTask } from "@/modules/tasks";
import { NotFoundError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    expect(messages[0].body).toBe("任务已分配给你。");
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
  it("验收成功通知使用状态说明", async () => {
    const task = await assigned();
    await transitionTask(fx.student.id, task.id, "submit", { note: "完成分析" });
    await transitionTask(fx.teacher.id, task.id, "accept");
    expect((await listMyNotifications(fx.student.id)).find((item) => item.type === "task_accepted")?.body).toBe("任务已验收通过。");
  });
  it("旧版系统通知更新展示文案但不改历史数据", async () => {
    const [note] = await db.insert(notifications).values({
      userId: fx.student.id,
      type: "task_accepted",
      title: "已通过：历史任务",
      body: "验收通过，干得漂亮",
    }).returning();
    expect((await listMyNotifications(fx.student.id))[0].body).toBe("任务已验收通过。");
    const [stored] = await db.select().from(notifications).where(eq(notifications.id, note.id));
    expect(stored.body).toBe("验收通过，干得漂亮");
  });
  it("成员填写的成果说明不因匹配旧文案而被替换", async () => {
    const task = await assigned();
    await transitionTask(fx.student.id, task.id, "submit", { note: "验收通过，干得漂亮" });
    expect((await listMyNotifications(fx.teacher.id)).find((item) => item.type === "task_submitted")?.body).toBe("验收通过，干得漂亮");
  });
});

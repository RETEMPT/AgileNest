import { beforeEach, describe, expect, it } from "vitest";
import { getMyNotificationFeed, listMyNotifications, markAllRead, markRead, notifyTaskDiscussion } from "@/modules/notify";
import { createTask } from "@/modules/tasks";
import { ForbiddenError, NotFoundError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";
import { db } from "@/db";
import { notifications, taskDiscussionPosts, tasks } from "@/db/schema";
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
    await submitEvidence(fx.student.id, task.id, "完成分析");
    expect(
      (await listMyNotifications(fx.teacher.id)).some(
        (n) => n.type === "task_submitted",
      ),
    ).toBe(true);
    await reviewEvidence(fx.teacher.id, task.id, "reject", "补充实验结论");
    expect(
      (await listMyNotifications(fx.student.id)).some(
        (n) => n.type === "task_rejected" && n.body?.includes("补充实验结论"),
      ),
    ).toBe(true);
  });
  it("验收成功通知使用状态说明", async () => {
    const task = await assigned();
    await submitEvidence(fx.student.id, task.id, "完成分析");
    await reviewEvidence(fx.teacher.id, task.id);
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
    await submitEvidence(fx.student.id, task.id, "验收通过，干得漂亮");
    expect((await listMyNotifications(fx.teacher.id)).find((item) => item.type === "task_submitted")?.body).toBe("验收通过，干得漂亮");
  });
  it("旧任务先后通知仅改展示，历史与成员原文保持不变", async () => {
    const [legacy] = await db.insert(notifications).values({ userId: fx.student.id, type: "task_update", title: "报告的依赖已更新", body: "新增前置依赖：调研记录" }).returning();
    const [member] = await db.insert(notifications).values({ userId: fx.student.id, type: "task_submitted", title: "报告的依赖已更新", body: "新增前置依赖：调研记录" }).returning();
    const rows = await listMyNotifications(fx.student.id);
    expect(rows.find((item) => item.id === legacy.id)).toMatchObject({ title: "报告的任务先后已更新", body: "设置需要先完成的任务：调研记录" });
    expect(rows.find((item) => item.id === member.id)).toMatchObject({ title: member.title, body: member.body });
    const [stored] = await db.select().from(notifications).where(eq(notifications.id, legacy.id));
    expect(stored).toMatchObject({ title: legacy.title, body: legacy.body });
  });
  it("浮窗只取最近 20 条，但完整未读数不会截断或跨账号", async () => {
    await db.insert(notifications).values([
      ...Array.from({ length: 105 }, (_, index) => ({ userId: fx.student.id, type: "task_assigned", title: `消息 ${index}` })),
      { userId: fx.outsider.id, type: "task_assigned", title: "其他账号消息" },
    ]);
    const feed = await getMyNotificationFeed(fx.student.id);
    expect(feed.notifications).toHaveLength(20);
    expect(feed.unreadCount).toBe(105);
    expect(feed.notifications.every((message) => message.userId === fx.student.id)).toBe(true);
  });
  it("全部已读仅更新本人未读消息，再次操作不重复更新", async () => {
    await db.insert(notifications).values([
      { userId: fx.student.id, type: "task_assigned", title: "本人消息" },
      { userId: fx.outsider.id, type: "task_assigned", title: "其他账号消息" },
    ]);
    expect(await markAllRead(fx.student.id)).toBe(1);
    expect(await markAllRead(fx.student.id)).toBe(0);
    expect((await getMyNotificationFeed(fx.student.id)).unreadCount).toBe(0);
    expect((await getMyNotificationFeed(fx.outsider.id)).unreadCount).toBe(1);
  });
  it("新讨论通知负责人，排除本人并对同条讨论防重复", async () => {
    const task = await assigned();
    const [post] = await db.insert(taskDiscussionPosts).values({ taskId: task.id, createdById: fx.admin.id, body: "请确认需求" }).returning();
    await db.transaction(async (tx) => { await notifyTaskDiscussion(fx.admin.id, task.id, post.id, tx); });
    await notifyTaskDiscussion(fx.admin.id, task.id, post.id);
    const messages = (await listMyNotifications(fx.student.id)).filter((message) => message.type === "task_discussion");
    expect(messages).toHaveLength(1);
    expect(messages[0].link).toBe(`/p/${fx.project.id}/tasks/${task.id}#discussion-${post.id}`);
    expect(await listMyNotifications(fx.admin.id)).toEqual([]);
    await expect(notifyTaskDiscussion(fx.student.id, task.id, post.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("讨论回复通知根作者，不通知任务中残留的其他团队账号", async () => {
    const task = await assigned();
    await db.update(tasks).set({ assigneeId: fx.outsider.id }).where(eq(tasks.id, task.id));
    const [parent] = await db.insert(taskDiscussionPosts).values({ taskId: task.id, createdById: fx.teacher.id, body: "请核对目标" }).returning();
    const [reply] = await db.insert(taskDiscussionPosts).values({ taskId: task.id, parentId: parent.id, createdById: fx.admin.id, body: "已补充说明" }).returning();
    await notifyTaskDiscussion(fx.admin.id, task.id, reply.id);
    expect((await listMyNotifications(fx.teacher.id)).filter((message) => message.type === "task_discussion_reply")).toHaveLength(1);
    expect(await listMyNotifications(fx.outsider.id)).toEqual([]);
    await expect(notifyTaskDiscussion(fx.outsider.id, task.id, reply.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

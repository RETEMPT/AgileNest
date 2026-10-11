import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { collaborationNotificationEvents, notificationFollows, notifications, teamMembers, teamResources } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createTask } from "@/modules/tasks";
import { createResource } from "@/modules/resources";
import { enqueueCollaborationNotice, getFollowState, getMyNotificationFeed, getNotificationPreferences, listMyFollows, listMyNotifications, notifyAccepted, notifyAssigned, notifyRejected, notifySubmitted, updateFollowState, updateNotificationPreferences, type CollaborationNoticeInput } from "@/modules/notify";
import { type FollowTarget } from "@/modules/notify/client";
import { makeFixture, resetDb } from "../../helpers";

describe("站内关注、提及与通知偏好", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  async function taskTarget(): Promise<FollowTarget> {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "通知链路任务" });
    return { kind: "task", id: task.id };
  }
  async function follow(userId: string, target: FollowTarget, following = true) {
    return updateFollowState(userId, { ...await getFollowState(userId, target), following });
  }
  function notice(target: FollowTarget, extra: Partial<CollaborationNoticeInput> = {}): CollaborationNoticeInput {
    return { target, event: "discussion", title: "新的协作讨论", body: "请核对本轮资料", link: `/p/${fx.project.id}/tasks/${target.id}`, eventKey: "post:1", ...extra };
  }
  it("项目、任务与资料均可关注，外部账号不可查询或关注", async () => {
    const task = await taskTarget();
    const resource = await createResource(fx.admin.id, { projectId: fx.project.id, kind: "document", title: "需求说明" });
    for (const target of [{ kind: "project" as const, id: fx.project.id }, task, { kind: "resource" as const, id: resource.id }]) {
      expect((await getFollowState(fx.student.id, target)).version).toBe(0);
      expect((await follow(fx.student.id, target)).following).toBe(true);
      await expect(getFollowState(fx.outsider.id, target)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(follow(fx.outsider.id, target)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await listMyFollows(fx.student.id)).toHaveLength(3);
  });
  it("取消保留版本，旧请求不能重新关注或覆盖当前选项", async () => {
    const target = await taskTarget();
    const enabled = await follow(fx.student.id, target);
    const cancelled = await updateFollowState(fx.student.id, { ...enabled, following: false });
    expect(cancelled.version).toBe(2);
    await expect(updateFollowState(fx.student.id, { ...enabled, following: true })).rejects.toBeInstanceOf(ConflictError);
    expect(await getFollowState(fx.student.id, target)).toEqual(cancelled);
    expect(await listMyFollows(fx.student.id)).toEqual([]);
    expect(await db.select().from(notificationFollows)).toHaveLength(1);
  });
  it("偏好只属于当前账号，持久化与409保留首次保存结果", async () => {
    const defaults = await getNotificationPreferences(fx.student.id);
    expect(defaults.version).toBe(0);
    const saved = await updateNotificationPreferences(fx.student.id, { ...defaults, mentions: false, showBubble: false });
    expect(saved.version).toBe(1);
    expect(await getNotificationPreferences(fx.student.id)).toEqual(saved);
    expect((await getNotificationPreferences(fx.teacher.id)).mentions).toBe(true);
    await expect(updateNotificationPreferences(fx.student.id, { ...defaults, taskUpdates: false })).rejects.toBeInstanceOf(ConflictError);
    expect((await getMyNotificationFeed(fx.student.id)).preferences.showBubble).toBe(false);
  });
  it("同一事件的提及、参与、事项与项目关注只产生一条通知，排除本人", async () => {
    const target = await taskTarget();
    await follow(fx.student.id, target);
    await follow(fx.student.id, { kind: "project", id: fx.project.id });
    await follow(fx.admin.id, target);
    const event = notice(target, { mentionedUserIds: [fx.student.id, fx.admin.id], participantUserIds: [fx.student.id] });
    await db.transaction((tx) => enqueueCollaborationNotice(fx.admin.id, event, tx));
    await enqueueCollaborationNotice(fx.admin.id, event);
    const messages = await listMyNotifications(fx.student.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("collaboration_mention");
    expect(await listMyNotifications(fx.admin.id)).toEqual([]);
    expect((await db.select().from(collaborationNotificationEvents)).filter((entry) => entry.eventKey.endsWith(":post:1"))).toHaveLength(1);
  });
  it("取消事项关注屏蔽项目继承，但参与或直接提及不会自动重建关注", async () => {
    const target = await taskTarget();
    await follow(fx.student.id, { kind: "project", id: fx.project.id });
    await follow(fx.student.id, target, false);
    await enqueueCollaborationNotice(fx.admin.id, notice(target));
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { eventKey: "post:2", participantUserIds: [fx.student.id] }));
    expect(await listMyNotifications(fx.student.id)).toHaveLength(1);
    expect((await getFollowState(fx.student.id, target)).following).toBe(false);
  });
  it("离队关注人与跨团队参与者不收件，跨团队提及拒绝且不扩权", async () => {
    const target = await taskTarget();
    await follow(fx.student.id, target);
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, fx.team.id), eq(teamMembers.userId, fx.student.id)));
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { participantUserIds: [fx.student.id, fx.outsider.id] }));
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
    expect(await listMyNotifications(fx.outsider.id)).toEqual([]);
    expect(await listMyFollows(fx.student.id)).toEqual([]);
    await expect(enqueueCollaborationNotice(fx.admin.id, notice(target, { eventKey: "post:2", mentionedUserIds: [fx.outsider.id] }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(enqueueCollaborationNotice(fx.outsider.id, notice(target))).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("类别偏好独立过滤，不因事后开启而重放已处理事件", async () => {
    const target = await taskTarget();
    await follow(fx.student.id, target);
    const saved = await updateNotificationPreferences(fx.student.id, { ...await getNotificationPreferences(fx.student.id), discussions: false, mentions: false });
    const event = notice(target, { mentionedUserIds: [fx.student.id], participantUserIds: [fx.student.id] });
    await enqueueCollaborationNotice(fx.admin.id, event);
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
    await updateNotificationPreferences(fx.student.id, { ...saved, discussions: true });
    await enqueueCollaborationNotice(fx.admin.id, event);
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
    await enqueueCollaborationNotice(fx.admin.id, { ...event, eventKey: "post:2" });
    expect((await listMyNotifications(fx.student.id))[0].type).toBe("task_discussion");
  });
  it("只关闭讨论仍可收直接提及，重复提及去重", async () => {
    const target = await taskTarget();
    await updateNotificationPreferences(fx.student.id, { ...await getNotificationPreferences(fx.student.id), discussions: false });
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { mentionedUserIds: [fx.student.id, fx.student.id] }));
    expect((await listMyNotifications(fx.student.id)).map((message) => message.type)).toEqual(["collaboration_mention"]);
  });
  it("资料更新遵循资料类别开关，团队共享资料不借用其他项目关注", async () => {
    const [resource] = await db.insert(teamResources).values({ teamId: fx.team.id, kind: "document", title: "团队通用资料", createdById: fx.admin.id }).returning();
    const target: FollowTarget = { kind: "resource", id: resource.id };
    await follow(fx.student.id, target);
    await follow(fx.teacher.id, { kind: "project", id: fx.project.id });
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { event: "resource_update", link: `/t/${fx.team.id}/resources?resource=${resource.id}` }));
    expect((await listMyNotifications(fx.student.id))[0].type).toBe("resource_update");
    expect(await listMyNotifications(fx.teacher.id)).toEqual([]);
    await updateNotificationPreferences(fx.student.id, { ...await getNotificationPreferences(fx.student.id), resourceUpdates: false });
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { event: "resource_update", eventKey: "version:2", link: `/t/${fx.team.id}/resources?resource=${resource.id}` }));
    expect(await listMyNotifications(fx.student.id)).toHaveLength(1);
  });
  it("原任务通知接口保持兼容并尊重关闭的类别", async () => {
    for (const userId of [fx.student.id, fx.admin.id, fx.teacher.id]) await updateNotificationPreferences(userId, { ...await getNotificationPreferences(userId), taskUpdates: false });
    const task = await createTask(fx.admin.id, fx.project.id, { title: "偏好任务", assigneeId: fx.student.id });
    await notifyAssigned(task.id); await notifyAccepted(task.id); await notifyRejected(task.id, "请补充验证"); await notifySubmitted(task.id);
    expect(await db.select().from(notifications)).toEqual([]);
  });
  it("原任务通知补充操作者后也投递给关注人并幂等", async () => {
    const target = await taskTarget();
    await follow(fx.teacher.id, target);
    await notifySubmitted(target.id, fx.admin.id);
    await notifySubmitted(target.id, fx.admin.id);
    expect((await listMyNotifications(fx.teacher.id)).filter((message) => message.type === "task_submitted")).toHaveLength(1);
    expect(await listMyNotifications(fx.admin.id)).toEqual([]);
  });
  it("失败事务回滚通知与幂等记录，之后可正常重试", async () => {
    const target = await taskTarget();
    const initialEvents = await db.select().from(collaborationNotificationEvents);
    await follow(fx.student.id, target);
    const event = notice(target);
    await expect(db.transaction(async (tx) => { await enqueueCollaborationNotice(fx.admin.id, event, tx); throw new ConflictError("模拟业务冲突"); })).rejects.toBeInstanceOf(ConflictError);
    expect(await db.select().from(collaborationNotificationEvents)).toEqual(initialEvents);
    expect(await listMyNotifications(fx.student.id)).toEqual([]);
    await enqueueCollaborationNotice(fx.admin.id, event);
    expect(await listMyNotifications(fx.student.id)).toHaveLength(1);
  });
  it("拒绝外部通知链接，目标删除后关注与事件不残留孤儿", async () => {
    const [resource] = await db.insert(teamResources).values({ teamId: fx.team.id, kind: "document", title: "可删除资料", createdById: fx.admin.id }).returning();
    const target: FollowTarget = { kind: "resource", id: resource.id };
    await follow(fx.student.id, target);
    await expect(enqueueCollaborationNotice(fx.admin.id, notice(target, { link: "https://example.test/resource" }))).rejects.toBeInstanceOf(AppError);
    await enqueueCollaborationNotice(fx.admin.id, notice(target, { event: "resource_update", link: `/t/${fx.team.id}/resources?resource=${resource.id}` }));
    await db.delete(teamResources).where(eq(teamResources.id, resource.id));
    expect(await db.select().from(notificationFollows)).toEqual([]);
    expect(await db.select().from(collaborationNotificationEvents)).toEqual([]);
    await expect(getFollowState(fx.student.id, target)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

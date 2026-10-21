import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES, followTargetSchema, notificationCategoryFor, notificationDisplayCopy, notificationLabel, notificationTarget, parseFollowState, parseNotificationFeed, parseNotificationPreferences } from "@/modules/notify/client";

const item = {
  id: "38b626fa-e050-48cd-9848-9f6ea252ea48",
  type: "task_discussion", title: "任务有新讨论", body: "请核对资料", link: "/p/project/tasks/task#discussion-post",
  readAt: null, createdAt: "2026-10-10T02:00:00.000Z",
};
describe("协作小助手消息契约", () => {
  it("摘要保留真实未读总数，不以截断列表长度替代", () => {
    expect(parseNotificationFeed({ notifications: [item], unreadCount: 157 })?.unreadCount).toBe(157);
  });
  it("拒绝负数未读数和非法时间", () => {
    expect(parseNotificationFeed({ notifications: [item], unreadCount: -1 })).toBeNull();
    expect(parseNotificationFeed({ notifications: [{ ...item, createdAt: "昨天" }], unreadCount: 1 })).toBeNull();
  });
  it("拒绝超出浮窗范围的消息列表", () => {
    expect(parseNotificationFeed({ notifications: Array.from({ length: 21 }, () => item), unreadCount: 21 })).toBeNull();
  });
  it("内部通知目标保留查询和具体讨论锚点", () => {
    expect(notificationTarget("/p/project/tasks/task?view=detail#discussion-post")).toBe("/p/project/tasks/task?view=detail#discussion-post");
  });
  it("拒绝外部、脚本、登录页以及绕过协议的目标", () => {
    for (const link of ["https://example.com", "javascript:alert(1)", "//example.com/p/task", "/\\example.com", "/p/../login", "/p/task\n"]) expect(notificationTarget(link)).toBeNull();
  });
  it("未知通知类型采用中性标签，讨论回复使用实际类型", () => {
    expect(notificationLabel("future_integration")).toBe("协作消息");
    expect(notificationLabel("task_discussion_reply")).toBe("讨论回复");
  });
});

describe("关注与通知偏好浏览器契约", () => {
  const target = { kind: "task" as const, id: item.id };
  it("旧摘要与包含气泡偏好的摘要都可读取", () => {
    expect(parseNotificationFeed({ notifications: [item], unreadCount: 1 })).not.toBeNull();
    expect(parseNotificationFeed({ notifications: [item], unreadCount: 1, preferences: { showBubble: false } })?.preferences?.showBubble).toBe(false);
  });
  it("目标只接收项目、任务或资料的合法 UUID", () => {
    expect(followTargetSchema.safeParse(target).success).toBe(true);
    expect(followTargetSchema.safeParse({ ...target, kind: "user" }).success).toBe(false);
    expect(followTargetSchema.safeParse({ ...target, id: "任意姓名" }).success).toBe(false);
  });
  it("关注初始版本和取消版本保留相同目标", () => {
    expect(parseFollowState({ target, following: false, version: 0 })?.version).toBe(0);
    expect(parseFollowState({ target, following: false, version: 2 })?.following).toBe(false);
  });
  it("关注版本不能为负数或小数", () => {
    expect(parseFollowState({ target, following: true, version: -1 })).toBeNull();
    expect(parseFollowState({ target, following: true, version: 1.5 })).toBeNull();
  });
  it("默认类别兼容旧通知，气泡开关独立保存", () => {
    expect(parseNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)?.taskUpdates).toBe(true);
    expect(parseNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, showBubble: false })?.showBubble).toBe(false);
  });
  it("偏好拒绝字符串布尔值和客户端指定他人账号", () => {
    expect(parseNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, mentions: "false" })).toBeNull();
    expect(parseNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, userId: item.id })).toBeNull();
  });
  it("通知类型映射到独立类别，提及不混入普通讨论", () => {
    expect(notificationCategoryFor("collaboration_mention")).toBe("mentions");
    expect(notificationCategoryFor("task_discussion_reply")).toBe("discussions");
    expect(notificationCategoryFor("resource_update")).toBe("resourceUpdates");
    expect(notificationCategoryFor("task_due_soon")).toBe("reminders");
  });
  it("资料和提及使用明确标签", () => {
    expect(notificationLabel("resource_comment")).toBe("资料评论");
    expect(notificationLabel("collaboration_mention")).toBe("提及了你");
  });
});

describe("历史通知的展示副本", () => {
  it("已知旧任务先后通知同时更新标题与说明", () => {
    expect(notificationDisplayCopy({ type: "task_update", title: "报告的依赖已更新", body: "新增前置依赖：调研" })).toEqual({ title: "报告的任务先后已更新", body: "设置需要先完成的任务：调研" });
  });
  it("旧取消顺序通知保留任务名称", () => {
    expect(notificationDisplayCopy({ type: "task_update", title: "调研的依赖已更新", body: "解除后续依赖：依赖分析报告" })).toEqual({ title: "调研的任务先后已更新", body: "取消接下来进行的任务：依赖分析报告" });
  });
  it("仅旧系统默认说明随固定标题更新", () => {
    expect(notificationDisplayCopy({ type: "task_update", title: "报告的依赖已更新", body: "任务依赖已更新" })).toEqual({ title: "报告的任务先后已更新", body: "任务先后已更新" });
  });
  it("不改成员成果说明、修改意见或评论", () => {
    for (const type of ["task_submitted", "task_rejected", "task_discussion", "resource_comment"]) {
      const original = { type, title: "报告的依赖已更新", body: "新增前置依赖：调研" };
      expect(notificationDisplayCopy(original)).toEqual({ title: original.title, body: original.body });
    }
  });
  it("标题或正文不同时匹配系统格式时保持原文", () => {
    expect(notificationDisplayCopy({ type: "task_update", title: "成员说明", body: "新增前置依赖：调研" })).toEqual({ title: "成员说明", body: "新增前置依赖：调研" });
    expect(notificationDisplayCopy({ type: "task_update", title: "报告的依赖已更新", body: "成员写的说明" })).toEqual({ title: "报告的依赖已更新", body: "成员写的说明" });
  });
  it("不修改输入对象，空正文保持为空", () => {
    const original = Object.freeze({ type: "task_update", title: "报告的依赖已更新", body: "新增前置依赖：调研" });
    notificationDisplayCopy(original);
    expect(original.body).toBe("新增前置依赖：调研");
    expect(notificationDisplayCopy({ type: "task_update", title: "普通任务更新", body: null })).toEqual({ title: "普通任务更新", body: null });
  });
});

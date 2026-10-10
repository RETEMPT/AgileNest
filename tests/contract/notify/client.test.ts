import { describe, expect, it } from "vitest";
import { notificationLabel, notificationTarget, parseNotificationFeed } from "@/modules/notify/client";

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

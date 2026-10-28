import { describe, expect, it } from "vitest";
import { isWorkNotification, latestWorkNotifications } from "@/modules/notify/client";

describe("工作消息优先", () => {
  it("分工进入工作消息", () => expect(isWorkNotification("task_assigned")).toBe(true));
  it("提交和修改意见进入工作消息", () => { expect(isWorkNotification("task_submitted")).toBe(true); expect(isWorkNotification("task_rejected")).toBe(true); });
  it("验收通过仍可核对", () => expect(isWorkNotification("task_accepted")).toBe(true));
  it("到期和本人提醒突出展示", () => { for (const type of ["task_due_soon", "task_overdue", "personal_reminder"]) expect(isWorkNotification(type)).toBe(true); });
  it("直接提及优先，普通评论和资料更新归动态", () => { expect(isWorkNotification("collaboration_mention")).toBe(true); for (const type of ["task_discussion", "task_discussion_reply", "resource_comment", "resource_update", "task_update"]) expect(isWorkNotification(type)).toBe(false); });
  it("未知消息不触发工作气泡", () => expect(isWorkNotification("unknown")).toBe(false));
  it("同事项保留最近一条工作消息，历史数组不改变", () => {
    const rows = [{ type: "task_accepted", link: "/p/a/tasks/b" }, { type: "task_submitted", link: "/p/a/tasks/b" }];
    expect(latestWorkNotifications(rows)).toEqual([rows[0]]);
    expect(rows).toHaveLength(2);
  });
  it("不同事项和无跳转提醒分别保留", () => {
    expect(latestWorkNotifications([{ type: "task_assigned", link: "/p/a/tasks/b" }, { type: "task_assigned", link: "/p/a/tasks/c" }, { type: "personal_reminder", link: null }, { type: "personal_reminder", link: null }])).toHaveLength(4);
  });
  it("普通动态不抢占工作消息的最新位置", () => {
    expect(latestWorkNotifications([{ type: "resource_update", link: "/p/a/tasks/b" }, { type: "task_rejected", link: "/p/a/tasks/b" }])).toEqual([{ type: "task_rejected", link: "/p/a/tasks/b" }]);
  });
});

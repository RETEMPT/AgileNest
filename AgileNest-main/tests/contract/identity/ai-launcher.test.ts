import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/notify/ui", () => ({ useNotificationFeed: () => ({ feed: null, refresh: vi.fn() }), NotificationDockPanel: () => null }));
vi.mock("@/components/ai/workspace", () => ({ AiWorkspace: () => null }));
import { CollaborationDock } from "@/components/ai/floating";

describe("完整 AI 页的协作悬浮入口", () => {
  it("完整 AI 页关闭悬浮按钮，不覆盖发送区", () => {
    const html = renderToStaticMarkup(createElement(CollaborationDock, { userId: "account", projects: [], aiEnabled: false, showLauncher: false }));
    expect(html).not.toContain("data-collaboration-dock");
    expect(html).not.toContain("打开协作中心");
  });
  it("其他页面默认保留协作入口，即使只启用消息", () => {
    const html = renderToStaticMarkup(createElement(CollaborationDock, { userId: "account", projects: [], aiEnabled: false }));
    expect(html).toContain("data-collaboration-dock");
    expect(html).toContain("打开协作中心");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { builtinCatalog, type PluginLibrary } from "@/modules/ai/client";
import { builtinEnabled, requestPluginChange } from "@/components/ai/plugin-library";
import { pluginMatches, PluginLibraryPanel } from "@/components/ai/plugin-library-ui";
import { appendPlanningSource } from "@/components/ai/planning-context";

const library: PluginLibrary = { revision: 4, builtins: builtinCatalog.map((item) => ({ id: item.id, enabled: item.id !== "office-reader" })), mcpServers: [] };
afterEach(() => vi.unstubAllGlobals());
describe("插件库与来源采纳", () => {
  it("内置能力与快捷提问是不同分类，读取服务器开关，未加载不冒充启用", () => {
    expect(builtinCatalog.filter((item) => item.kind === "prompt")).toHaveLength(4);
    expect(builtinCatalog.filter((item) => item.kind === "tool")).toHaveLength(5);
    expect(builtinEnabled(library, "office-reader")).toBe(false);
    expect(builtinEnabled(library, "task-planner")).toBe(true);
    expect(builtinEnabled(null, "task-planner")).toBe(false);
  });
  it("库初始折叠功能组，读取配置前开关不可写，MCP不假称已连接", () => {
    const html = renderToStaticMarkup(createElement(PluginLibraryPanel, { userId: "test-account" }));
    expect(html).toContain("内置工具"); expect(html).toContain("快捷提问"); expect(html).toContain("MCP 连接");
    expect(html).not.toContain("open="); expect(html).toContain("disabled="); expect(html).not.toContain("已连接"); expect(html).toContain("调用参数会发送至该地址");
  });
  it("搜索名称与功能说明时不区分大小写", () => {
    expect(pluginMatches("pptx", "Office文字读取", "提取PPTX幻灯片")).toBe(true);
    expect(pluginMatches("转录", "文件工具", "仅提取文字")).toBe(false);
  });
  it("开关请求带版本保存服务器，工具发现使用真实发现接口", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(library), { headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
    const change = { expectedRevision: 3, builtins: [{ id: "office-reader", enabled: false }] };
    expect(await requestPluginChange(change, new AbortController().signal, "PUT")).toEqual(library);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/ai/plugins"); expect(fetcher.mock.calls[0][1].method).toBe("PUT"); expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(change);
    fetcher.mockResolvedValue(new Response(JSON.stringify(library))); await requestPluginChange({ serverId: "server", expectedRevision: 4 }, new AbortController().signal, "discover");
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/ai/plugins/discover"); expect(fetcher.mock.calls[1][1].method).toBe("POST");
  });
  it("版本冲突原样提示重载，不把失败当已保存", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"插件配置已在其他窗口更新，请重新加载"}', { status: 409 })));
    await expect(requestPluginChange({ expectedRevision: 1 }, new AbortController().signal, "PATCH")).rejects.toThrow("其他窗口更新");
  });
  it("显式采纳只追加来源，不覆盖目标；超出容量拒绝", () => {
    expect(appendPlanningSource("原有目标", "新来源内容")).toBe("原有目标\n\n新来源内容");
    expect(appendPlanningSource("", "新来源内容")).toBe("新来源内容");
    expect(() => appendPlanningSource("保".repeat(29999), "来源")).toThrow("剩余额度");
  });
});

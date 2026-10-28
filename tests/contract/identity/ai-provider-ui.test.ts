import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderCards } from "@/components/ai/provider-settings";
import { ConnectionForm, initialModelConfiguration } from "@/components/ai/connection-settings";
import type { ModelProviderList } from "@/modules/ai/client";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const providers: ModelProviderList["providers"] = [first, second].map((id, index) => ({ id, configuration: { ...initialModelConfiguration, name: `服务${index + 1}`, baseUrl: `https://provider${index + 1}.example/v1`, model: `model-${index + 1}` }, updatedAt: "2026-10-15T00:00:00Z" }));
const noop = () => {};
function cards(activeId: string | null, busy = false, entries = providers) {
  return renderToStaticMarkup(createElement(ProviderCards, { providers: entries, activeId, busy, onActivate: noop, onEdit: noop, onDelete: noop, onTest: noop, onAdd: noop }));
}

describe("模型服务商卡片与配置边界", () => {
  it("仅选中项显示使用中，同时保留其他提供商切换入口", () => {
    const html = cards(first);
    expect(html.match(/>使用中</g)).toHaveLength(1);
    expect(html).toContain("当前服务");
    expect(html).toContain("使用此服务");
    expect(html).toContain("model-1");
    expect(html).toContain("model-2");
  });
  it("没有当前服务时不暗中选择首项", () => {
    const html = cards(null);
    expect(html).not.toContain("使用中");
    expect(html.match(/>使用此服务</g)).toHaveLength(2);
  });
  it("空列表仍保留末尾新增卡片", () => {
    const html = cards(null, false, []);
    expect(html).toContain("添加 API 服务商");
    expect(html).toContain("0 / 12");
    expect(html).not.toContain("<article");
  });
  it("请求期间所有操作禁用，避免重复切换、删除或提交", () => {
    const html = cards(first, true);
    for (const button of html.matchAll(/<button\b[^>]*>/g)) expect(button[0]).toContain("disabled");
  });
  it("卡片展示地址与名称并为编辑删除提供明确读屏名称", () => {
    const html = cards(first);
    expect(html).toContain('aria-label="编辑服务1"');
    expect(html).toContain('aria-label="删除服务2"');
    expect(html).toContain("https://provider1.example/v1");
    expect(html).not.toContain('name="model_api_key"');
  });
  it("编辑表单不回显已有密钥，默认遮罩并保持更多选项收起", () => {
    const html = renderToStaticMarkup(createElement(ConnectionForm, { configuration: providers[0].configuration, providerId: first, knownIds: [first, second], revision: 2, onSaved: noop }));
    const input = html.match(/<input\b[^>]*name="model_api_key"[^>]*>/)![0];
    expect(input).toContain('type="password"');
    expect(input).toContain('value=""');
    expect(input).toContain('autoComplete="new-password"');
    expect(html).toContain("留空继续使用");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });
});

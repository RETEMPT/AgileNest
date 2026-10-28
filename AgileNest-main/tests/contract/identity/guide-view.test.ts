import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GuideView } from "@/modules/identity/guide-view";
import { findTransition, STATUS_LABELS } from "@/modules/tasks/client";
import { SETTINGS_SECTIONS, settingsSection } from "@/modules/identity/settings-sections";

describe("独立使用指引", () => {
  it("章节导航均定位到唯一存在的分区，标题关联可读", () => {
    const html = renderToStaticMarkup(createElement(GuideView));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/href="#([^"]+)"/g)) expect(ids).toContain(match[1]);
    for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(ids).toContain(match[1]);
  });
  it("任务图例沿用实际打回与重交流程，不提供业务执行按钮", () => {
    const html = renderToStaticMarkup(createElement(GuideView));
    const figure = html.match(/<figure aria-label="任务流程图例"[\s\S]*?<\/figure>/)![0];
    const reject = findTransition("reject", "submitted")!;
    const resubmit = findTransition("resubmit", reject.to)!;
    for (const label of [reject.label, resubmit.label, STATUS_LABELS[reject.to], STATUS_LABELS[resubmit.to]]) expect(figure).toContain(label);
    expect(figure).not.toContain("<button");
  });
  it("文件与贡献示例标明示意，不冒充可编辑真实资料或成员数据", () => {
    const html = renderToStaticMarkup(createElement(GuideView));
    expect(html).toContain("示例文件");
    expect(html).toContain("示意数据");
    for (const figure of html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)) expect(figure[0]).not.toMatch(/<(?:button|input|form)\b/);
  });
  it("个人中心不再保留指引分区，实际配置链接仍进入对应设置", () => {
    expect(SETTINGS_SECTIONS).not.toContain("guide");
    expect(settingsSection("guide")).toBe("profile");
    const html = renderToStaticMarkup(createElement(GuideView));
    expect(html).toContain('href="/settings?section=ai"');
    expect(html).toContain('href="/settings?section=notifications"');
    expect(html).not.toContain("section=guide");
  });
});

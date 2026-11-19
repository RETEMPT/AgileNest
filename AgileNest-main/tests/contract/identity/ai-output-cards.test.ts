import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatOutputUi } from "@/modules/ai/client";
import { ChatOutputCards, changeRequestSource } from "@/components/ai/chat-output-ui";
import { appendModelReply } from "@/components/ai/chat-client";
import { decodeNotebook, EMPTY_NOTEBOOK, saveDraft, type AiDraft } from "@/components/ai/drafts";
import { taskPlanStorageKey } from "@/components/ai/task-plan";

const ui: ChatOutputUi = { version: 1, summary: "建议先澄清验收范围", questions: ["谁负责确认最终成果？"], roadmap: [{ title: "梳理目标", outcome: "确认后的需求说明", orderNote: "确认后再拆任务" }], changeRequests: [{ title: "补充接口验收任务", problem: "现有要求缺少异常场景", proposal: "整理失败处理要求，形成可核对清单", acceptanceCriteria: ["列出已确认的失败场景及预期结果"], impact: "影响接口验收范围", risks: ["失败场景需由负责人确认"] }] };
describe("可信项目建议卡片与确认入口", () => {
  it("摘要可读，问题路线细项默认收起，所有建议默认未选且不能直接创建", () => {
    const html = renderToStaticMarkup(createElement(ChatOutputCards, { ui, disabled: false, onPreview: () => undefined }));
    expect(html).toContain(ui.summary); expect(html).toContain("待你审批"); expect(html).toContain("预览新任务规划");
    expect(html).not.toContain("checked="); expect(html).not.toContain("open="); expect(html).toContain("disabled="); expect(html).not.toMatch(/<button\b[^>]*>确认创建/);
  });
  it("必须显式选择，将问题方案验收影响风险完整带入而非执行动作", () => {
    expect(() => changeRequestSource(ui, [])).toThrow("先选择"); expect(() => changeRequestSource(ui, [9])).toThrow("先选择");
    const source = changeRequestSource(ui, [0, 0]);
    expect(source.selectionKey).toBe("0"); expect(source.text).toContain(ui.changeRequests[0].problem); expect(source.text).toContain(ui.changeRequests[0].proposal); expect(source.text).toContain(ui.changeRequests[0].acceptanceCriteria[0]); expect(source.text).toContain(ui.changeRequests[0].impact); expect(source.text).toContain(ui.changeRequests[0].risks[0]); expect(source.text).toContain("创建前仍需预览确认");
  });
  it("回复正文中的HTML仅作文字，不执行任意组件或脚本", () => {
    const html = renderToStaticMarkup(createElement(ChatOutputCards, { ui: { ...ui, summary: "<script>alert(1)</script>" }, disabled: false, onPreview: () => undefined }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
  it("只有真实任务来源才能出现已有任务修改入口", () => {
    const without = renderToStaticMarkup(createElement(ChatOutputCards, { ui, disabled: false, onPreview: () => undefined })); expect(without).not.toContain("前往任务审阅修改");
    const id = "b0cce1bc-ce6b-46b6-bc6b-520a7b67f344";
    const withTask = renderToStaticMarkup(createElement(ChatOutputCards, { ui, disabled: false, onPreview: () => undefined, workSources: [{ kind: "task", id, title: "来源任务", href: `/p/${id}/tasks/${id}`, excerpt: "待处理" }] }));
    expect(withTask).toContain("前往任务审阅修改"); expect(withTask).toContain(`/tasks/${id}`);
  });
  it("结构化内容与来源跟随真实回复保存，旧会话无需新字段", () => {
    const draft: AiDraft = { id: "initial", title: "旧会话", text: "请给修改建议", customTitle: false, updatedAt: "2026-10-16T01:00:00.000Z" };
    const saved = appendModelReply(saveDraft(EMPTY_NOTEBOOK, draft), draft, draft.text, { text: "以下为建议", model: "fixture", ui }, draft.updatedAt);
    expect(decodeNotebook(JSON.stringify(saved)).drafts[0].messages?.[1].ui).toEqual(ui);
    expect(decodeNotebook(JSON.stringify(saveDraft(EMPTY_NOTEBOOK, draft))).drafts[0].messages).toBeUndefined();
  });
  it("同一消息建议复用独立批次，其他建议和任务来源不覆盖它", () => {
    const context = { sourceId: "message:changes:0", title: "对话建议" };
    expect(taskPlanStorageKey("u", "p", context)).toBe(taskPlanStorageKey("u", "p", { ...context, title: "改名" }));
    expect(taskPlanStorageKey("u", "p", context)).not.toBe(taskPlanStorageKey("u", "p", { sourceId: "message:changes:1", title: "对话" }));
    expect(taskPlanStorageKey("u", "p", context)).not.toBe(taskPlanStorageKey("u", "p", { taskId: "message:changes:0", title: "任务" }));
  });
});

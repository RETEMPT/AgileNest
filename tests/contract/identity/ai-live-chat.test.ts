import { describe, expect, it } from "vitest";
import { appendModelReply, chatMessages } from "@/components/ai/chat-client";
import { decodeNotebook, EMPTY_NOTEBOOK, saveDraft, type AiDraft } from "@/components/ai/drafts";
import type { LocalMaterial, MaterialRef } from "@/components/ai/materials";

const now = "2026-10-15T05:00:00.000Z";
const draft: AiDraft = { id: "initial", title: "新对话", customTitle: false, text: "请总结资料", updatedAt: now };
const material: MaterialRef = { id: "a0b2a0c1-3e8a-48c3-9e05-a2f6fe3daa58", name: "说明.md", kind: "text", size: 10, createdAt: now };
function file(text = "可核对的原文"): LocalMaterial { return { ref: material, text, blob: new Blob([text]) }; }

describe("真实模型对话与旧会话兼容", () => {
  it("按真实角色组织历史，只附带用户选择的文字资料", async () => {
    const source = { ...draft, materials: [material], messages: [{ id: crypto.randomUUID(), role: "assistant" as const, text: "已有回复", model: "my-model", createdAt: now }] };
    const messages = await chatMessages(source, source.text, async (id) => { expect(id).toBe(material.id); return file(); });
    expect(messages).toEqual([{ role: "assistant", content: "已有回复" }, { role: "user", content: "请总结资料\n\n\n资料：说明.md\n可核对的原文" }]);
  });
  it("图片/PDF不能被默默当作已发送的文字，过长正文不静默截断", async () => {
    await expect(chatMessages({ ...draft, materials: [{ ...material, kind: "pdf" }] }, draft.text, async () => file())).rejects.toThrow("图片或 PDF");
    await expect(chatMessages({ ...draft, materials: [material] }, draft.text, async () => file("长".repeat(30001)))).rejects.toThrow("资料过长");
  });
  it("真实回复与本人消息成对保存，不覆盖名称或原文引用", () => {
    const source = { ...draft, customTitle: true, title: "保留会话名称", materials: [material] };
    const notebook = saveDraft(EMPTY_NOTEBOOK, source);
    const result = appendModelReply(notebook, source, source.text, { text: "根据提供的原文，结论如下", reasoning: "分析了用户的提问，决定给出结论", model: "my-model" }, now);
    expect(result.drafts[0]).toMatchObject({ title: source.title, text: "", materials: [], messages: [{ role: "user", text: source.text, materials: [material] }, { role: "assistant", text: "根据提供的原文，结论如下", model: "my-model" }] });
    expect(result.drafts[0].messages?.[1].reasoning).toBeUndefined();
    expect(notebook.drafts[0].text).toBe(source.text);
  });
  it("另一窗口修改输入或删除会话时，回复不能覆盖或复活旧会话", () => {
    expect(() => appendModelReply(saveDraft(EMPTY_NOTEBOOK, { ...draft, text: "另一个窗口的输入" }), draft, draft.text, { text: "回复", model: "m" }, now)).toThrow("其他窗口修改");
    expect(() => appendModelReply(EMPTY_NOTEBOOK, { ...draft, id: crypto.randomUUID() }, draft.text, { text: "回复", model: "m" }, now)).toThrow("已删除");
  });
  it("会话达到上限前拒绝发出无法完整保存的请求", async () => {
    const source = { ...draft, messages: Array.from({ length: 19 }, () => ({ id: crypto.randomUUID(), text: "旧内容", createdAt: now })) };
    await expect(chatMessages(source, draft.text, async () => file())).rejects.toThrow("会话已满");
  });
  it("旧无角色记录仍可读取，新模型长回复和角色可恢复", () => {
    const source = { ...draft, messages: [{ id: crypto.randomUUID(), text: "旧记录", createdAt: now }, { id: crypto.randomUUID(), role: "assistant" as const, text: "答".repeat(7000), model: "m", createdAt: now }] };
    const result = decodeNotebook(JSON.stringify(saveDraft(EMPTY_NOTEBOOK, source)));
    expect(result.drafts[0].messages?.[0].role).toBeUndefined();
    expect(result.drafts[0].messages?.[1].text).toHaveLength(7000);
    expect(() => appendModelReply(saveDraft(EMPTY_NOTEBOOK, draft), draft, draft.text, { text: "", model: "m" }, now)).toThrow("回复为空");
  });
});

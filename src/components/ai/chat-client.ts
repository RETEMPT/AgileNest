import { chatRequestSchema, type ChatRequest, type ChatResult } from "@/modules/ai/client";
import { MAX_LOCAL_MESSAGES, MAX_REPLY_LENGTH, saveDraft, titleFromText, type AiDraft, type DraftNotebook } from "./drafts";
import type { LocalMaterial, MaterialRef } from "./materials";

export async function chatMessages(draft: AiDraft, input: string, read: (id: string) => Promise<LocalMaterial>): Promise<ChatRequest["messages"]> {
  if ((draft.messages?.length ?? 0) + 2 > MAX_LOCAL_MESSAGES) throw new Error("此会话已满，请新建对话后继续");
  async function content(text: string, materials?: MaterialRef[]) {
    const parts = [text.trim()];
    for (const material of materials ?? []) {
      if (material.kind !== "text") throw new Error("此接口当前发送文本资料。请先移除图片或 PDF，或将需要的文字粘贴到消息中");
      const stored = await read(material.id);
      if (!stored.text) throw new Error(`“${material.name}”的正文无法读取，请重新添加`);
      parts.push(`\n资料：${material.name}\n${stored.text}`);
    }
    const value = parts.filter(Boolean).join("\n\n");
    if (value.length > 30000) throw new Error("文字资料过长，请在资料面板选取需要的段落后发送");
    return value;
  }
  const messages: ChatRequest["messages"] = [];
  for (const message of draft.messages ?? []) messages.push({ role: message.role ?? "user", content: await content(message.text, message.materials) });
  messages.push({ role: "user", content: await content(input, draft.materials) });
  const parsed = chatRequestSchema.safeParse({ projectId: draft.projectId ?? null, messages });
  if (!parsed.success) throw new Error("消息为空或会话资料过多，请减少资料或新建对话");
  return parsed.data.messages;
}

export function appendModelReply(notebook: DraftNotebook, source: AiDraft, input: string, reply: { text: string; reasoning?: string; model: string; sources?: ChatResult["sources"]; workSources?: ChatResult["workSources"]; toolSources?: ChatResult["toolSources"]; ui?: ChatResult["ui"]; retrieval?: ChatResult["retrieval"] }, now: string): DraftNotebook {
  const current = notebook.drafts.find((item) => item.id === source.id);
  if (!current && source.id !== "initial") throw new Error("此会话已删除。模型回复仍在页面，请复制保留");
  const latest = current ?? source;
  if ((notebook.activeId && notebook.activeId !== source.id) || latest.text !== input || JSON.stringify(latest.messages ?? []) !== JSON.stringify(source.messages ?? []) || JSON.stringify(latest.materials ?? []) !== JSON.stringify(source.materials ?? []) || (latest.projectId ?? null) !== (source.projectId ?? null)) throw new Error("此会话已在其他窗口修改。模型回复仍在页面，请复制保留");
  if ((latest.messages?.length ?? 0) + 2 > MAX_LOCAL_MESSAGES) throw new Error("此会话已满，模型回复仍在页面，请复制保留");
  if (!reply.text.trim() || reply.text.length > MAX_REPLY_LENGTH) throw new Error("模型回复为空或过长，未覆盖当前输入");
  return saveDraft(notebook, { ...latest, title: latest.customTitle ? latest.title : titleFromText(latest.messages?.[0]?.text || input || "资料问答"), text: "", materials: [], updatedAt: now, messages: [...latest.messages ?? [], { id: crypto.randomUUID(), role: "user", text: input.trim() || "请阅读所选文字资料", materials: latest.materials, createdAt: now }, { id: crypto.randomUUID(), role: "assistant", text: reply.text, model: reply.model, sources: reply.sources, workSources: reply.workSources, toolSources: reply.toolSources, ui: reply.ui, retrieval: reply.retrieval, createdAt: now }] });
}

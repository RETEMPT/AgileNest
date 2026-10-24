import { accountFetch } from "@/components/account-request";
import { chatResultSchema, chatStreamEventSchema, type ChatRequest, type ChatResult, type ChatProgress } from "@/modules/ai/client";

export async function requestChat(body: ChatRequest, signal: AbortSignal, onProgress: (progress: ChatProgress) => void): Promise<ChatResult> {
  const response = await accountFetch("/api/v1/ai/chat?stream=1", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(body), signal, cache: "no-store" });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "请求失败，请稍后重试");
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) return chatResultSchema.parse(await response.json());
  if (!response.body) throw new Error("对话连接未返回内容，请重试");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", total = 0;
  const parse = (line: string): ChatResult | undefined => {
    if (!line.trim()) return;
    const event = chatStreamEventSchema.parse(JSON.parse(line));
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") onProgress(event);
    else return chatResultSchema.parse({ text: event.text, model: event.model, sources: event.sources, workSources: event.workSources, toolSources: event.toolSources, ...(event.ui ? { ui: event.ui } : {}), retrieval: event.retrieval });
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1024 * 1024) throw new Error("回复内容过大，请缩小问题范围后重试");
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        const result = parse(line);
        if (result) return result;
      }
    }
    pending += decoder.decode();
    const result = parse(pending);
    if (result) return result;
    throw new Error("连接在回复完成前中断，输入已保留，请重试");
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

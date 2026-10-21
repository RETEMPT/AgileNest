import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { requestChat } from "@/components/ai/chat-stream";
import { ChatSources, ChatProgressList, safeChatSourceHref } from "@/components/ai/chat-response-ui";
import { readMaterial } from "@/components/ai/materials";
import { appendModelReply } from "@/components/ai/chat-client";
import { decodeNotebook, EMPTY_NOTEBOOK, saveDraft, type AiDraft } from "@/components/ai/drafts";

const id = "b0cce1bc-ce6b-46b6-bc6b-520a7b67f344";
const result = { text: "依据来源1，验收要求如下", model: "test-model", sources: [{ resourceId: id, title: "课题说明", version: 3, href: `/p/${id}/resources?resource=${id}&revision=3`, excerpt: "真实资料正文", location: "幻灯片 2" }], workSources: [], toolSources: [], retrieval: { scope: "project" as const, searchedScopes: 1, matchedResources: 1, readResources: 1, truncated: false } };
const progress = { type: "progress" as const, phase: "reading" as const, message: "正在读取课题说明" };
const body = { messages: [{ role: "user" as const, content: "有哪些验收要求？" }], knowledgeScope: "project" as const, projectId: id };
afterEach(() => vi.unstubAllGlobals());

describe("聊天读取阶段、来源和文件交互", () => {
  it("逐行读取真实阶段并保留跨分块中文与最终来源", async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(progress)}\n${JSON.stringify({ type: "result", ...result })}\n`);
    const stream = new ReadableStream({ start(target) { for (let i = 0; i < bytes.length; i += 7) target.enqueue(bytes.slice(i, i + 7)); target.close(); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } })); vi.stubGlobal("fetch", fetcher);
    const onProgress = vi.fn();
    expect(await requestChat(body, new AbortController().signal, onProgress)).toEqual(result);
    expect(onProgress).toHaveBeenCalledWith(progress);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).knowledgeScope).toBe("project");
  });
  it("失败和未完成连接不能被当作成功回复", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${JSON.stringify(progress)}\n`, { headers: { "Content-Type": "application/x-ndjson" } })));
    await expect(requestChat(body, new AbortController().signal, () => undefined)).rejects.toThrow("中断");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"type":"error","error":"资料权限已变化"}\n', { headers: { "Content-Type": "application/x-ndjson" } })));
    await expect(requestChat(body, new AbortController().signal, () => undefined)).rejects.toThrow("权限已变化");
  });
  it("停止请求不会接纳随后到达的回复", async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${JSON.stringify({ type: "result", ...result })}\n`, { headers: { "Content-Type": "application/x-ndjson" } })));
    await expect(requestChat(body, controller.signal, () => undefined)).rejects.toThrow();
  });
  it("来源和处理详情默认折叠，版本跳转可核验，禁止脚本链接", () => {
    const html = renderToStaticMarkup(createElement(ChatSources, result));
    expect(html).toContain("revision=3"); expect(html).toContain("幻灯片 2"); expect(html).not.toContain("open=");
    expect(renderToStaticMarkup(createElement(ChatProgressList, { progress: [progress] }))).not.toContain("open=");
    expect(safeChatSourceHref("javascript:alert(1)")).toBeUndefined(); expect(safeChatSourceHref("//other.test/p/file")).toBeUndefined(); expect(safeChatSourceHref(result.sources[0].href)).toBe(result.sources[0].href);
  });
  it("真实引用随回复保存，旧思维链不进入新回复", () => {
    const draft: AiDraft = { id: "initial", title: "新对话", text: body.messages[0].content, customTitle: false, updatedAt: "2026-10-16T01:00:00.000Z" };
    const notebook = appendModelReply(saveDraft(EMPTY_NOTEBOOK, draft), draft, draft.text, { ...result, reasoning: "不应保存的分析" }, draft.updatedAt);
    const restored = decodeNotebook(JSON.stringify(notebook));
    expect(restored.drafts[0].messages?.[1].sources).toEqual(result.sources);
    expect(restored.drafts[0].messages?.[1].reasoning).toBeUndefined();
  });
  it("选择现代课件才上传解析，保留原文件和提取范围提示", async () => {
    const file = new File(["test fixture"], "课件.pptx");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ format: "pptx", text: "第 1 张幻灯片\n课程目标", sections: [], truncated: true, warnings: ["只读取文字"] }), { headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
    const material = await readMaterial(file);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/ai/extract-file"); expect(fetcher.mock.calls[0][1].body.get("file").name).toBe(file.name);
    expect(material.text).toContain("课程目标"); expect(material.ref.extraction?.truncated).toBe(true); expect(await material.blob.text()).toBe("test fixture");
    expect(material.blob.type).toContain("presentation");
  });
  it("解析失败不会伪造已读取内容，普通文本不上传", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"文件结构损坏"}', { status: 400 })); vi.stubGlobal("fetch", fetcher);
    await expect(readMaterial(new File(["bad"], "坏课件.pptx"))).rejects.toThrow("结构损坏");
    fetcher.mockClear(); const material = await readMaterial(new File(["本机正文"], "资料.md"));
    expect(material.text).toBe("本机正文"); expect(fetcher).not.toHaveBeenCalled();
  });
});

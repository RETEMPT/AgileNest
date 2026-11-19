import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/modules/core";
import { modelChatPOST, modelExtractFilePOST } from "@/modules/ai/api";
const calls = vi.hoisted(() => ({ user: vi.fn(), chat: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireApiUser: calls.user }));
vi.mock("@/modules/resources", () => ({ extractFileContent: calls.extract }));
vi.mock("@/modules/ai/service", () => ({ chatWithModel: calls.chat }));
const url = "http://localhost/api/v1/ai/chat";
const result = { text: "真实回答", model: "fixture", sources: [], workSources: [], retrieval: { scope: "none", searchedScopes: 0, matchedResources: 0, readResources: 0, truncated: false } };
const request = (path = url, headers: Record<string, string> = {}) => new NextRequest(path, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify({ knowledgeScope: "none", messages: [{ role: "user", content: "你好" }] }) });
beforeEach(() => { vi.clearAllMocks(); calls.user.mockResolvedValue({ id: "alice" }); calls.chat.mockResolvedValue(result); });
describe("聊天阶段流和文件读取薄API", () => {
  it("默认JSON保持兼容且传递当前账号和取消信号", async () => {
    const response = await modelChatPOST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
    expect(calls.chat.mock.calls[0][0]).toBe("alice"); expect(calls.chat.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });
  it("NDJSON发送真实阶段与最终结果，不含内部思考", async () => {
    calls.chat.mockImplementation(async (_actor, _cookie, _input, _signal, progress) => { progress({ type: "progress", phase: "reading", message: "正在读取" }); return result; });
    const response = await modelChatPOST(request(`${url}?stream=1`));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect((await response.text()).trim().split("\n").map((line) => JSON.parse(line))).toEqual([{ type: "progress", phase: "reading", message: "正在读取" }, { type: "result", ...result }]);
  });
  it("阶段流错误使用中文错误而不回传堆栈", async () => {
    calls.chat.mockRejectedValue(new AppError("资料版本已变化", 409));
    const response = await modelChatPOST(request(url, { accept: "application/x-ndjson" }));
    expect(JSON.parse((await response.text()).trim())).toEqual({ type: "error", error: "资料版本已变化" });
  });
  it("跨站和未登录在流打开前拒绝", async () => {
    expect((await modelChatPOST(request(url, { origin: "http://evil.example" }))).status).toBe(403);
    calls.user.mockRejectedValue(new AppError("请先登录", 401));
    expect((await modelChatPOST(request())).status).toBe(401); expect(calls.chat).not.toHaveBeenCalled();
  });
  it("本地PPTX仅通过登录同源读取，不保存文件", async () => {
    calls.extract.mockResolvedValue({ format: "pptx", text: "第1页\n课程目标", sections: [{ index: 1, label: "第1页", text: "课程目标" }], truncated: false, warnings: [] });
    const form = new FormData(); form.set("file", new File([new Uint8Array([80, 75, 1, 2])], "course.pptx"));
    const response = await modelExtractFilePOST(new NextRequest("http://localhost/api/v1/ai/extract-file", { method: "POST", headers: { origin: "http://localhost" }, body: form }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ format: "pptx", text: expect.stringContaining("课程目标") });
    expect(calls.extract.mock.calls[0][0]).toMatchObject({ name: "course.pptx", bytes: expect.any(Uint8Array) });
  });
  it("拒绝过大上传、多文件和畸形multipart", async () => {
    const large = new NextRequest("http://localhost/api/v1/ai/extract-file", { method: "POST", headers: { origin: "http://localhost", "content-type": "multipart/form-data", "content-length": "12000000" }, body: "x" });
    expect((await modelExtractFilePOST(large)).status).toBe(413);
    const form = new FormData(); form.append("file", new File(["a"], "a.txt")); form.append("file", new File(["b"], "b.txt"));
    expect((await modelExtractFilePOST(new NextRequest("http://localhost/api/v1/ai/extract-file", { method: "POST", headers: { origin: "http://localhost" }, body: form }))).status).toBe(400);
    const malformed = new NextRequest("http://localhost/api/v1/ai/extract-file", { method: "POST", headers: { origin: "http://localhost", "content-type": "multipart/form-data; boundary=fake" }, body: "bad" });
    expect((await modelExtractFilePOST(malformed)).status).toBe(400); expect(calls.extract).not.toHaveBeenCalled();
  });
});

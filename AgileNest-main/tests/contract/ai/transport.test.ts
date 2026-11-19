import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicModelAddress, modelEndpoint, normalizeModelBaseUrl, requestModelJson } from "@/modules/ai/transport";
const network = vi.hoisted(() => ({ dns: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.dns }));
vi.mock("node:https", () => ({ request: network.request }));
vi.mock("node:http", () => ({ request: network.request }));
let status = 200; let raw = '{"choices":[]}'; let pending = false;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AI_ALLOWED_LOCAL_ORIGINS", "");
  status = 200; raw = '{"choices":[]}'; pending = false;
  network.dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  network.request.mockImplementation((_url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const emitter = new EventEmitter();
    options.signal?.addEventListener("abort", () => emitter.emit("error", new Error("aborted")), { once: true });
    return Object.assign(emitter, { end: () => queueMicrotask(() => {
      if (pending) return;
      const stream = new PassThrough();
      const response = Object.assign(stream, { statusCode: status, headers: {} }) as unknown as IncomingMessage;
      callback(response); stream.end(raw);
    }) }) as unknown as ClientRequest;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("模型网络目标与返回边界", () => {
  it("拒绝 HTTP、公网地址中的账号参数和内网地址", () => {
    for (const address of ["http://models.example.com", "https://user:key@models.example.com", "https://models.example.com?key=value", "https://localhost", "https://127.1", "https://10.0.0.1", "https://169.254.169.254", "https://[::1]"]) expect(() => normalizeModelBaseUrl(address)).toThrow();
    expect(normalizeModelBaseUrl("https://models.example.com/v1/")).toBe("https://models.example.com/v1");
  });
  it("拒绝私网、元数据、映射地址、文档段与保留 IPv6", () => {
    for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.100.100.200", "168.63.129.16", "224.0.0.1", "198.18.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2001:db8::1", "2001::1", "2::1", "2002:7f00:1::"]) expect(isPublicModelAddress(address), address).toBe(false);
    expect(isPublicModelAddress("8.8.8.8")).toBe(true); expect(isPublicModelAddress("2001:4860:4860::8888")).toBe(true);
    expect(isPublicModelAddress("::ffff:8.8.8.8")).toBe(true); expect(isPublicModelAddress("::ffff:808:808")).toBe(true);
    expect(isPublicModelAddress("::ffff:a00:1")).toBe(false);
  });
  it("仅服务器允许的完整 origin 可以使用内网 HTTP", () => {
    process.env.AI_ALLOWED_LOCAL_ORIGINS = "http://127.0.0.1:11434";
    expect(normalizeModelBaseUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
    expect(() => normalizeModelBaseUrl("http://127.0.0.1:11435/v1")).toThrow();
    expect(() => normalizeModelBaseUrl("http://localhost:11434/v1")).toThrow();
  });
  it("根地址补 /v1，已含 /v1 的地址不重复补全", () => {
    expect(modelEndpoint("https://models.example.com", "responses").pathname).toBe("/v1/responses");
    expect(modelEndpoint("https://models.example.com/v1/", "chat/completions").pathname).toBe("/v1/chat/completions");
    expect(() => modelEndpoint("https://models.example.com/v1/messages", "models")).toThrow("不要包含具体接口");
  });
  it("DNS 任一结果指向内网时先拒绝，不携带密钥发起请求", async () => {
    network.dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), { Authorization: "Bearer secret" }, {}, 10)).rejects.toMatchObject({ status: 400 });
    expect(network.request).not.toHaveBeenCalled();
  });
  it("网络请求固定已校验 DNS 地址，防止连接时重新解析", async () => {
    expect(await requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).toEqual({ choices: [] });
    expect(network.dns).toHaveBeenCalledTimes(1);
    const options = network.request.mock.calls[0][1] as RequestOptions;
    const callback = vi.fn(); options.lookup!("models.example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
    expect(options.agent).toBe(false);
  });
  it("双栈地址全部校验后固定候选，允许 Node 在已验地址间连接", async () => {
    network.dns.mockResolvedValue([{ address: "2001:4860:4860::8888", family: 6 }, { address: "8.8.8.8", family: 4 }]);
    await requestModelJson(new URL("https://models.example.com/v1/models"), {}, undefined, 10);
    const options = network.request.mock.calls[0][1] as RequestOptions;
    const callback = vi.fn(); options.lookup!("models.example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }, { address: "2001:4860:4860::8888", family: 6 }]);
    expect(options).toMatchObject({ autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 });
  });
  it("代理虚拟 DNS 错误可理解，只有服务器明确允许对应 origin 才请求", async () => {
    network.dns.mockResolvedValue([{ address: "198.18.0.103", family: 4 }]);
    const url = new URL("https://models.example.edu/api/v1/models");
    await expect(requestModelJson(url, {}, undefined, 10)).rejects.toThrow("代理虚拟地址");
    expect(network.request).not.toHaveBeenCalled();
    process.env.AI_ALLOWED_LOCAL_ORIGINS = "https://models.example.edu";
    await expect(requestModelJson(url, {}, undefined, 10)).resolves.toEqual({ choices: [] });
    process.env.AI_ALLOWED_LOCAL_ORIGINS = '"https://models.example.edu/api/v1"';
    await expect(requestModelJson(url, {}, undefined, 10)).resolves.toEqual({ choices: [] });
    await expect(requestModelJson(new URL("https://other.example.com/v1/models"), {}, undefined, 10)).rejects.toThrow("代理虚拟地址");
    expect(network.request).toHaveBeenCalledTimes(2);
  });
  it("响应提前关闭立即报错，不会一直等到超时", async () => {
    network.request.mockImplementationOnce((_url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const request = new EventEmitter();
      return Object.assign(request, { end: () => queueMicrotask(() => {
        const stream = new PassThrough(); const response = Object.assign(stream, { statusCode: 200, headers: {} }) as unknown as IncomingMessage;
        callback(response); stream.write('{"partial":'); stream.destroy();
      }) }) as unknown as ClientRequest;
    });
    await expect(requestModelJson(new URL("https://models.example.com/v1/models"), {}, undefined, 10)).rejects.toThrow("中途断开");
  });
  it("不跟随上游重定向，不泄露上游授权错误正文", async () => {
    status = 302; await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).rejects.toThrow("跳转");
    expect(network.request).toHaveBeenCalledTimes(1);
    status = 401; raw = "secret-from-upstream";
    await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).rejects.toThrow("检查密钥");
  });
  it("限流、无效 JSON 和超过 1MB 的响应明确失败", async () => {
    status = 429; await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).rejects.toMatchObject({ status: 429 });
    status = 200; raw = "<html>untrusted raw</html>"; await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).rejects.toThrow("无法识别");
    raw = "x".repeat(1024 * 1024 + 1); await expect(requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10)).rejects.toThrow("响应过大");
  });
  it("取消后终止请求并提供明确结果", async () => {
    pending = true; const controller = new AbortController();
    const task = requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10, controller.signal);
    await vi.waitFor(() => expect(network.request).toHaveBeenCalledTimes(1)); controller.abort();
    await expect(task).rejects.toMatchObject({ status: 499 });
  });
  it("超时包括等待模型回应的时间", async () => {
    vi.useFakeTimers(); pending = true;
    const task = requestModelJson(new URL("https://models.example.com/v1/messages"), {}, {}, 10);
    const checked = expect(task).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(10001); await checked;
  });
  it("等待 DNS 解析时取消也不会再发出携带密钥的请求", async () => {
    network.dns.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const task = requestModelJson(new URL("https://models.example.com/v1/messages"), { Authorization: "Bearer secret" }, {}, 10, controller.signal);
    controller.abort(); await expect(task).rejects.toMatchObject({ status: 499 });
    expect(network.request).not.toHaveBeenCalled();
  });
});

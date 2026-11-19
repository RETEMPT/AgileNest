import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/modules/core/errors";
import { accountFetch } from "@/components/account-request";
import { ACCOUNT_CHANGED_EVENT, ACCOUNT_CHANGED_MESSAGE, ACCOUNT_HEADER } from "@/components/account-context";
import { jsonError, requireApiUser } from "@/lib/api";
import { GET } from "@/app/api/v1/account/route";

const mocks = vi.hoisted(() => ({ user: vi.fn(), headers: vi.fn() }));
vi.mock("@/modules/core/session", () => ({ tryUser: mocks.user }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
beforeEach(() => {
  mocks.user.mockResolvedValue({ id: "alice" });
  mocks.headers.mockResolvedValue(new Headers({ [ACCOUNT_HEADER]: "alice" }));
  vi.stubGlobal("document", { querySelector: () => ({ getAttribute: () => "alice" }) });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("页面账号与当前会话绑定", () => {
  it("账号一致时使用服务器会话身份", async () => { expect(await requireApiUser()).toEqual({ id: "alice" }); });
  it("其他标签登录 bob 后，alice 旧页面在读取和写入前被拒绝", async () => {
    mocks.user.mockResolvedValue({ id: "bob" });
    await expect(requireApiUser()).rejects.toMatchObject({ status: 409, message: ACCOUNT_CHANGED_MESSAGE });
    const response = await GET();
    expect(response.status).toBe(409);
    expect(response.headers.get("X-AgileNest-Account-Changed")).toBe("1");
    expect(await response.text()).not.toContain("bob");
  });
  it("空页面账号不能跟随已登录 Cookie 操作", async () => {
    mocks.headers.mockResolvedValue(new Headers({ [ACCOUNT_HEADER]: "" }));
    await expect(requireApiUser()).rejects.toMatchObject({ status: 409 });
  });
  it("伪造账号头不能代替登录或授予权限", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(requireApiUser()).rejects.toMatchObject({ status: 401 });
  });
  it("检查响应不包含账号资料并禁止缓存", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("已有不带账号头的外部调用仍只获得自身会话身份", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    expect(await requireApiUser()).toEqual({ id: "alice" });
  });
  it("浏览器固定使用页面账号，保留请求格式并禁用缓存", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetcher);
    await accountFetch("/api/v1/ai/providers", { method: "PUT", headers: { [ACCOUNT_HEADER]: "bob", "Content-Type": "application/json" }, body: "{}" });
    const [, options] = fetcher.mock.calls[0];
    expect(options.headers.get(ACCOUNT_HEADER)).toBe("alice");
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options).toMatchObject({ method: "PUT", body: "{}", credentials: "same-origin", cache: "no-store" });
  });
  it("账号请求拒绝外部地址，账号标识不发给第三方", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(accountFetch("https://other.example/api/")).rejects.toThrow("当前网站");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("账号变化会取消正在发送的请求", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => { options.signal?.addEventListener("abort", () => reject(new Error("cancelled"))); })));
    const request = accountFetch("/api/v1/ai/chat", { method: "POST", body: "{}" });
    const outcome = expect(request).rejects.toThrow("cancelled");
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
    await outcome;
  });
  it("401 或账号冲突会通知旧页面停用", async () => {
    const changed = vi.fn(); window.addEventListener(ACCOUNT_CHANGED_EVENT, changed);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409, headers: { "X-AgileNest-Account-Changed": "1" } })));
    await accountFetch("/api/v1/resources/favorites");
    expect(changed).toHaveBeenCalledOnce();
  });
  it("普通版本冲突不误判为切换账号", async () => {
    const changed = vi.fn(); window.addEventListener(ACCOUNT_CHANGED_EVENT, changed);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    await accountFetch("/api/v1/resources/favorites");
    expect(changed).not.toHaveBeenCalled();
  });
  it("未知错误不会把连接字符串、查询与密钥写到 API 日志或返回浏览器", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("secret-provider-key database-password private-query");
    const response = jsonError(error);
    expect(await response.text()).not.toContain("secret-provider-key");
    expect(JSON.stringify(log.mock.calls)).not.toContain(error.message);
    expect(jsonError(new AppError(ACCOUNT_CHANGED_MESSAGE, 409)).headers.get("cache-control")).toBe("private, no-store");
    log.mockRestore();
  });
});

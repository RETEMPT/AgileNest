import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeModelProvider, listModelProviders, resolveModelProvider, saveModelProvider } from "@/modules/ai/providers";
import { sealModelConfiguration } from "@/modules/ai/credentials";
import type { ModelConfiguration } from "@/modules/ai/client";

const configuration: ModelConfiguration = { name: "服务甲", provider: "compatible", baseUrl: "https://models.example.com/v1", model: "test-model", protocol: "chat", timeoutSeconds: 90, maxOutputTokens: 4096 };
let directory: string;
beforeEach(async () => { directory = ""; await mkdir(path.resolve(".tools"), { recursive: true }); directory = await mkdtemp(path.resolve(".tools/provider-test-")); vi.stubEnv("AI_PROVIDER_STORE_DIR", directory); vi.stubEnv("AUTH_SECRET", "provider-store-contract-secret"); });
afterEach(async () => { vi.unstubAllEnvs(); if (directory.startsWith(path.resolve(".tools") + path.sep)) await rm(directory, { recursive: true, force: true }); });
const save = (revision = 0) => saveModelProvider("alice", { expectedRevision: revision, configuration: { ...configuration, apiKey: "private-test-key" } });

describe("按账号加密的多个模型提供商", () => {
  it("新增不自动启用，保存摘要和文件均不暴露密钥", async () => {
    const list = await save(); expect(list.activeId).toBeNull(); expect(list.revision).toBe(1);
    expect(JSON.stringify(list)).not.toContain("private-test-key");
    const files = await readdir(directory); expect(files).toHaveLength(1);
    expect((await readFile(path.join(directory, files[0]))).includes(Buffer.from("private-test-key"))).toBe(false);
    expect(await listModelProviders("bob")).toEqual({ revision: 0, activeId: null, providers: [] });
  });
  it("显式选择服务，并可测试另一服务而不改变选择", async () => {
    const first = await save(); const second = await saveModelProvider("alice", { expectedRevision: 1, configuration: { ...configuration, name: "服务乙", model: "other-model", apiKey: "other-key" } });
    await changeModelProvider("alice", { expectedRevision: 2, op: "activate", id: first.providers[0].id });
    expect((await resolveModelProvider("alice")).apiKey).toBe("private-test-key");
    expect((await resolveModelProvider("alice", undefined, second.providers[1].id)).apiKey).toBe("other-key");
    expect((await listModelProviders("alice")).activeId).toBe(first.providers[0].id);
  });
  it("版本冲突与并发请求不覆盖已有保存", async () => {
    const results = await Promise.allSettled([save(), save()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected"); expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
    expect((await listModelProviders("alice")).providers).toHaveLength(1);
  });
  it("只有相同 ID、地址和协议才能保留密钥", async () => {
    const first = await save(); const id = first.providers[0].id;
    await saveModelProvider("alice", { expectedRevision: 1, id, configuration: { ...configuration, model: "updated", apiKey: "" } });
    expect((await resolveModelProvider("alice", undefined, id)).apiKey).toBe("private-test-key");
    for (const changed of [{ ...configuration, baseUrl: "https://other.example.com/v1" }, { ...configuration, protocol: "responses" }]) await expect(saveModelProvider("alice", { expectedRevision: 2, id, configuration: changed })).rejects.toThrow("重新填写密钥");
    await expect(saveModelProvider("alice", { expectedRevision: 2, configuration })).rejects.toThrow("真实 API 密钥");
    await expect(resolveModelProvider("bob", undefined, id)).rejects.toMatchObject({ status: 404 });
    await expect(resolveModelProvider("alice", undefined, undefined, configuration)).rejects.toThrow("真实 API 密钥");
  });
  it("删除当前服务会停用，不切换到另一服务或旧 Cookie", async () => {
    const first = await save(); const id = first.providers[0].id;
    await changeModelProvider("alice", { expectedRevision: 1, op: "activate", id });
    const removed = await changeModelProvider("alice", { expectedRevision: 2, op: "delete", id });
    expect(removed.activeId).toBeNull();
    const cookie = sealModelConfiguration({ actorId: "alice", configuration, apiKey: "old-key", expiresAt: Date.now() + 10000 });
    await expect(resolveModelProvider("alice", cookie)).rejects.toMatchObject({ status: 409 });
    expect((await listModelProviders("alice", cookie)).providers).toHaveLength(0);
  });
  it("旧 Cookie 仅首次按所属账号迁移，之后不覆盖服务", async () => {
    const cookie = sealModelConfiguration({ actorId: "alice", configuration, apiKey: "old-key", expiresAt: Date.now() + 10000 });
    expect((await listModelProviders("bob", cookie)).providers).toHaveLength(0);
    const list = await listModelProviders("alice", cookie); expect(list.activeId).toBe(list.providers[0].id);
    expect((await resolveModelProvider("alice")).apiKey).toBe("old-key");
    expect(await listModelProviders("alice", cookie)).toEqual(list);
  });
  it("文件损坏或账号文件被替换时不覆盖数据、不采用其他账号密钥", async () => {
    await save(); const files = await readdir(directory); const filename = path.join(directory, files[0]);
    await writeFile(filename, "corrupted");
    await expect(listModelProviders("alice")).rejects.toMatchObject({ status: 503 });
    await expect(save()).rejects.toMatchObject({ status: 503 });
    expect(await readFile(filename, "utf8")).toBe("corrupted");
  });
  it("最多保留 12 个服务，失败不递增版本", async () => {
    for (let index = 0; index < 12; index++) await save(index);
    await expect(save(12)).rejects.toThrow("最多保存 12 个");
    expect((await listModelProviders("alice")).revision).toBe(12);
  });
});

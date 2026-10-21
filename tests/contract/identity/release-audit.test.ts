import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/release/audit-private.mjs");
let directory: string;
beforeEach(async () => { await mkdir(".next", { recursive: true }); directory = await mkdtemp(path.resolve(".next/audit-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
function audit() { return spawnSync(process.execPath, [script, "--bundle", path.join(directory, "bundle")], { cwd: directory, encoding: "utf8" }); }
async function file(name: string, content: string) { const target = path.join(directory, "bundle", name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); }

describe("发布包敏感信息审计门禁", () => {
  it("允许公开演示数据与干净构建产物", async () => {
    await file("app/server.js", "// compiled app"); await file("RELEASE.md", "student@agilecampus.local / password123");
    const result = audit(); expect(result.status).toBe(0); expect(JSON.parse(result.stdout).findings).toEqual([]);
  });
  it("拒绝本机环境文件，不输出文件内容", async () => {
    await file("app/.env.local", "API_KEY=synthetic-secret-never-publish");
    const result = audit(); expect(result.status).toBe(1); expect(result.stdout).toContain("private-file"); expect(result.stdout).not.toContain("synthetic-secret-never-publish");
  });
  it("拒绝运行数据和加密配置，即使没有明文密钥", async () => {
    await file("data/config.json", "{}"); await file("app/.data/ai-providers/account.enc", "encrypted");
    const result = audit(); expect(result.status).toBe(1); expect(JSON.parse(result.stdout).findings).toHaveLength(2);
  });
  it("比较本机真实值时只报告位置和类别", async () => {
    const secret = "synthetic-auth-value-for-release-audit-123";
    await writeFile(path.join(directory, ".env"), `AUTH_SECRET=${secret}`); await file("app/server.js", `export const leaked = '${secret}'`);
    const result = audit(); expect(result.status).toBe(1); expect(result.stdout).toContain("local-environment-secret"); expect(result.stdout).not.toContain(secret);
  });
  it("拒绝高置信凭据格式且不回显命中内容", async () => {
    const token = "ghp_" + "a".repeat(36); await file("app/server.js", `const token = '${token}'`);
    const result = audit(); expect(result.status).toBe(1); expect(result.stdout).toContain("credential-pattern"); expect(result.stdout).not.toContain(token);
  });
});

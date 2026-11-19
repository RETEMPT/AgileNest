import { describe, it, expect } from "vitest";
import { tokenCreateSchema, authenticateApiToken } from "@/modules/identity/token-service";

describe("Personal API Token 契约与安全规则", () => {
  it("创建入参校验：名称不可为空，长度不超过 100", () => {
    expect(tokenCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "Claude Code CLI" }).success).toBe(true);
  });

  it("有效天数范围限制 1 ~ 365 天", () => {
    expect(tokenCreateSchema.safeParse({ name: "测试", expiresInDays: 0 }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "测试", expiresInDays: 366 }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "测试", expiresInDays: -1 }).success).toBe(false);
    expect(tokenCreateSchema.safeParse({ name: "测试", expiresInDays: 30 }).success).toBe(true);
    expect(tokenCreateSchema.safeParse({ name: "测试" }).success).toBe(true);
  });

  it("authenticateApiToken 拒绝无凭证、非 Bearer 及前缀不匹配的请求", async () => {
    expect(await authenticateApiToken(null)).toBeNull();
    expect(await authenticateApiToken("")).toBeNull();
    expect(await authenticateApiToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(await authenticateApiToken("Bearer ")).toBeNull();
    expect(await authenticateApiToken("Bearer other_prefix_123456")).toBeNull();
  });
});

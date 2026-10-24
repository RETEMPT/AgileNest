import { describe, expect, it } from "vitest";
import { discussionCreateSchema, discussionEditSchema, discussionHistorySchema, discussionListSchema, discussionPostSchema, discussionResolveSchema } from "@/modules/discussions/client";

describe("讨论浏览器公开边界", () => {
  it("正文或真实文件 ID 可独立创建，正文去除首尾空白", () => {
    expect(discussionCreateSchema.parse({ body: " 内容 " })).toEqual({ body: "内容", resourceIds: [], mentionedUserIds: [] });
    expect(discussionCreateSchema.parse({ resourceIds: [crypto.randomUUID()] }).body).toBe("");
  });
  it("拒绝空讨论和非法附件", () => {
    expect(discussionCreateSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(discussionCreateSchema.safeParse({ body: "内容", resourceIds: ["bad"] }).success).toBe(false);
  });
  it("正文与附件容量明确受限", () => {
    expect(discussionCreateSchema.safeParse({ body: "文".repeat(10000) }).success).toBe(true);
    expect(discussionCreateSchema.safeParse({ body: "文".repeat(10001) }).success).toBe(false);
    expect(discussionCreateSchema.safeParse({ resourceIds: Array.from({ length: 11 }, () => crypto.randomUUID()) }).success).toBe(false);
  });
  it("编辑和解决操作必须携带合法版本", () => {
    expect(discussionEditSchema.safeParse({ body: "更新", version: 0 }).success).toBe(false);
    expect(discussionResolveSchema.safeParse({ version: 1, resolved: true }).success).toBe(true);
    expect(discussionResolveSchema.safeParse({ version: 1, resolved: "yes" }).success).toBe(false);
  });
  it("帖子 DTO 拒绝缺少权限与文件元数据的响应", () => {
    expect(discussionPostSchema.safeParse({ id: crypto.randomUUID(), body: "不完整" }).success).toBe(false);
    expect(discussionListSchema.parse({ posts: [], truncated: false, limit: 200 }).posts).toEqual([]);
  });
  it("历史响应解析真实编辑记录", () => {
    const entry = { id: crypto.randomUUID(), version: 2, body: "旧内容", kind: "edit", changedById: null, authorName: null, createdAt: new Date().toISOString() };
    expect(discussionHistorySchema.parse({ revisions: [entry] }).revisions[0].version).toBe(2);
    expect(discussionHistorySchema.safeParse({ revisions: [{ ...entry, kind: "fake" }] }).success).toBe(false);
  });
});

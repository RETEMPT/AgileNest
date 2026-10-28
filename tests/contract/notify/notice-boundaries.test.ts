import { describe, expect, it } from "vitest";
import { collaborationNoticeSchema } from "../../../src/modules/notify/schema";

describe("内部通知收件人边界", () => {
  const input = { target: { kind: "project", id: "00000000-0000-4000-8000-000000000001" }, event: "resource_comment", title: "资料评论", link: "/p/00000000-0000-4000-8000-000000000001", eventKey: "comment:1" };
  it("100名协作者加作者与父评论作者不会因数组上限失败", () => { const participantUserIds = Array.from({ length: 102 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`); expect(collaborationNoticeSchema.parse({ ...input, participantUserIds }).participantUserIds).toHaveLength(102); });
  it("重复参与者去重且仍拒绝非法目标和过长文本", () => { expect(collaborationNoticeSchema.parse({ ...input, participantUserIds: [input.target.id, input.target.id] }).participantUserIds).toHaveLength(1); expect(collaborationNoticeSchema.safeParse({ ...input, participantUserIds: ["bad"] }).success).toBe(false); expect(collaborationNoticeSchema.safeParse({ ...input, title: "文".repeat(201) }).success).toBe(false); });
});

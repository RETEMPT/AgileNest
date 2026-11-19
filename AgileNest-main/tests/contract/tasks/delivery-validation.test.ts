import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checksMatchCriteria, deliverySchema, requirementsSchema, reviewSchema } from "@/modules/tasks/delivery-validation";
import { TRANSITIONS, transitionNeedsDialog } from "@/modules/tasks/client";

describe("提交边界与共用交互规则", () => {
  const criterionId = randomUUID();
  const delivery = { requirementsVersion: 1, summary: "完成", verification: "测试通过", links: [{ title: "报告", url: "https://example.test/report" }], resourceIds: [], checks: [{ criterionId, met: true }] };
  it("接受完整链接证据及逐项自检", () => { expect(deliverySchema.safeParse(delivery).success).toBe(true); });
  it("拒绝无证据和空验证结果", () => { expect(deliverySchema.safeParse({ ...delivery, links: [] }).success).toBe(false); expect(deliverySchema.safeParse({ ...delivery, verification: " " }).success).toBe(false); });
  it("拒绝可执行协议的链接", () => { expect(deliverySchema.safeParse({ ...delivery, links: [{ title: "非法", url: "javascript:alert(1)" }] }).success).toBe(false); });
  it("要求自检和验收项一一对应，不允许缺失或重复", () => { const criteria = [{ id: criterionId, text: "测试" }]; expect(checksMatchCriteria(criteria, delivery.checks)).toBe(true); expect(checksMatchCriteria(criteria, [])).toBe(false); expect(checksMatchCriteria(criteria, [...delivery.checks, ...delivery.checks])).toBe(false); });
  it("要求维护使用非负整数版本和唯一清单", () => { expect(requirementsSchema.safeParse({ version: 0, criteria: [{ id: criterionId, text: "测试通过" }] }).success).toBe(true); expect(requirementsSchema.safeParse({ version: -1, criteria: [] }).success).toBe(false); expect(requirementsSchema.safeParse({ version: 1, criteria: [{ id: criterionId, text: "A" }, { id: criterionId, text: "B" }] }).success).toBe(false); });
  it("评审必须指向版本并提供结论", () => { expect(reviewSchema.safeParse({ submissionId: "", summary: "通过", checks: [] }).success).toBe(false); expect(reviewSchema.safeParse({ submissionId: randomUUID(), summary: " ", checks: [] }).success).toBe(false); });
  it("不允许把验收要求维护为空清单", () => { expect(requirementsSchema.safeParse({ version: 1, criteria: [] }).success).toBe(false); });
  it("提交、打回和验收都通过统一弹窗，认领保留直接动作", () => { for (const action of ["submit", "resubmit", "accept", "reject"] as const) expect(transitionNeedsDialog(TRANSITIONS.find((rule) => rule.action === action)!)).toBe(true); expect(transitionNeedsDialog(TRANSITIONS.find((rule) => rule.action === "claim")!)).toBe(false); });
});

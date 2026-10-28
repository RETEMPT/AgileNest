import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deliveryBatchInputSchema, deliveryCompletionError, deliveryMarkdown, deliveryMutationSchema, type DeliverySnapshot } from "@/modules/delivery/client";

const input = () => ({ name: "中期研究报告", description: "汇总研究材料", ownerId: randomUUID(), dueDate: "2026-10-31", checklist: [{ id: randomUUID(), text: "结论与证据对应", checked: false, note: "" }] });
describe("通用交付边界与核对", () => {
  it("报告类阶段不依赖代码仓库字段", () => { expect(deliveryBatchInputSchema.parse(input()).name).toBe("中期研究报告"); });
  it("拒绝不存在的日历日期并接受闰日", () => { expect(deliveryBatchInputSchema.safeParse({ ...input(), dueDate: "2026-02-31" }).success).toBe(false); expect(deliveryBatchInputSchema.safeParse({ ...input(), dueDate: "2024-02-29" }).success).toBe(true); });
  it("清单不能重复、空白或超过40项", () => { const value = input(); expect(deliveryBatchInputSchema.safeParse({ ...value, checklist: [...value.checklist, ...value.checklist] }).success).toBe(false); expect(deliveryBatchInputSchema.safeParse({ ...value, checklist: [{ ...value.checklist[0], text: " " }] }).success).toBe(false); expect(deliveryBatchInputSchema.safeParse({ ...value, checklist: Array.from({ length: 41 }, () => ({ ...value.checklist[0], id: randomUUID() })) }).success).toBe(false); });
  it("操作必须有版本，问题解决必须给出结果", () => { expect(deliveryMutationSchema.safeParse({ op: "complete", version: 0 }).success).toBe(false); expect(deliveryMutationSchema.safeParse({ op: "resolve", version: 1, issueId: randomUUID(), issueVersion: 1, resolution: " " }).success).toBe(false); expect(deliveryMutationSchema.safeParse({ op: "restore", version: 2 }).success).toBe(true); });
  it("确认守卫要求负责人、成果、全清单及无待处理问题", () => {
    const base = { ownerId: randomUUID(), checklist: [{ checked: true }], entries: [{ currentTaskStatus: "accepted" as const }], issues: [] };
    expect(deliveryCompletionError(base)).toBeNull(); expect(deliveryCompletionError({ ...base, ownerId: null })).toContain("责任人"); expect(deliveryCompletionError({ ...base, entries: [] })).toContain("通过"); expect(deliveryCompletionError({ ...base, checklist: [] })).toContain("检查项"); expect(deliveryCompletionError({ ...base, issues: [{ resolved: false }] })).toContain("未解决"); expect(deliveryCompletionError({ ...base, entries: [{ currentTaskStatus: "in_progress" }] })).toContain("状态");
  });
  it("导出由真实快照形成，保留问题与责任人而非凭空生成报告", () => { const snapshot: DeliverySnapshot = { ...input(), status: "draft", archived: false, ownerName: "成员甲", entries: [], issues: [{ id: randomUUID(), taskId: null, title: "缺来源引用", detail: "报告第2节补充文献索引", ownerId: null, ownerName: null, resolved: false, resolution: null }] }; const markdown = deliveryMarkdown(snapshot, 3); expect(markdown).toContain("v3"); expect(markdown).toContain("成员甲"); expect(markdown).toContain("报告第2节"); expect(markdown).not.toContain("GitHub"); });
});

import { describe, expect, it } from "vitest";
import { availableTransitions, matchesTaskOrganization, taskActionItemCreateSchema, taskLabelCreateSchema, taskLabelPatchSchema, taskOrganizationMutationSchema, wouldCreateTaskDependencyCycle, type TaskOrganizationSummary } from "@/modules/tasks/client";

const idA = "a7a1db1b-4270-4ee4-b393-6a07d27806c8";
const idB = "b0495a54-09bb-4ccf-97eb-629383805d34";
const idC = "c3f3c679-de06-4c53-8220-9712b86689a7";

describe("任务标签与依赖纯契约", () => {
  it("标签统一去首尾空白，颜色使用有限token", () => {
    expect(taskLabelCreateSchema.parse({ name: "  前端  " })).toEqual({ name: "前端", color: "brand" });
    expect(taskLabelCreateSchema.safeParse({ name: "前端", color: "url(javascript:alert(1))" }).success).toBe(false);
    expect(taskLabelCreateSchema.safeParse({ name: " ", color: "brand" }).success).toBe(false);
    expect(taskLabelCreateSchema.safeParse({ name: "a".repeat(41) }).success).toBe(false);
  });
  it("标签编辑必须携带正版本，不接受额外归属字段", () => {
    expect(taskLabelPatchSchema.safeParse({ name: "后端", version: 1 }).success).toBe(true);
    expect(taskLabelPatchSchema.safeParse({ name: "后端", version: 0 }).success).toBe(false);
    expect(taskLabelPatchSchema.safeParse({ name: "后端", version: 1, projectId: idA }).success).toBe(false);
  });
  it("标签替换防重复及过多标签，允许清空", () => {
    expect(taskOrganizationMutationSchema.safeParse({ op: "labels", version: 1, labelIds: [idA, idA] }).success).toBe(false);
    expect(taskOrganizationMutationSchema.parse({ op: "labels", version: 1, labelIds: [] })).toMatchObject({ op: "labels", labelIds: [] });
    expect(taskOrganizationMutationSchema.safeParse({ op: "labels", version: 1, labelIds: Array(21).fill(idA) }).success).toBe(false);
  });
  it("依赖仅支持两个明确方向和命名任务uuid", () => {
    expect(taskOrganizationMutationSchema.safeParse({ op: "addDependency", version: 1, direction: "blockedBy", otherTaskId: idA }).success).toBe(true);
    expect(taskOrganizationMutationSchema.safeParse({ op: "addDependency", version: 1, direction: "backlog", otherTaskId: idA }).success).toBe(false);
    expect(taskOrganizationMutationSchema.safeParse({ op: "removeDependency", version: 1, dependencyId: "123" }).success).toBe(false);
  });
  it("拒绝自身和间接循环，允许独立或同向关系", () => {
    const edges = [{ blockerTaskId: idA, blockedTaskId: idB }, { blockerTaskId: idB, blockedTaskId: idC }];
    expect(wouldCreateTaskDependencyCycle(edges, idA, idA)).toBe(true);
    expect(wouldCreateTaskDependencyCycle(edges, idC, idA)).toBe(true);
    expect(wouldCreateTaskDependencyCycle(edges, idA, idC)).toBe(false);
    expect(wouldCreateTaskDependencyCycle(edges, "独立", idA)).toBe(false);
  });
  it("遍历既有异常循环也能结束，多路径不能漏检", () => {
    const edges = [{ blockerTaskId: idA, blockedTaskId: idB }, { blockerTaskId: idB, blockedTaskId: idA }, { blockerTaskId: idB, blockedTaskId: idC }];
    expect(wouldCreateTaskDependencyCycle(edges, "独立", idA)).toBe(false);
    expect(wouldCreateTaskDependencyCycle(edges, idC, idA)).toBe(true);
  });
  it("标签与阻塞筛选兼容旧DTO，false不会当作缺少筛选", () => {
    const row: TaskOrganizationSummary = { labels: [{ id: idA, projectId: idB, name: "后端", color: "brand", version: 1 }], blockedByIds: [idC], blockingIds: [], blocked: true, reopenBlocked: false };
    expect(matchesTaskOrganization(row, { labelId: idA, blocked: true })).toBe(true);
    expect(matchesTaskOrganization(row, { blocked: false })).toBe(false);
    expect(matchesTaskOrganization({}, { blocked: false })).toBe(true);
    expect(matchesTaskOrganization({}, { labelId: idA })).toBe(false);
  });
  it("阻塞规则在同一转移入口生效，不增加第六态", () => {
    const task = { status: "in_progress" as const, assigneeId: idA, blocked: true };
    expect(availableTransitions(task, "student", idA).map((rule) => rule.action)).toEqual(["unclaim"]);
    expect(availableTransitions({ ...task, blocked: false }, "student", idA).map((rule) => rule.action)).toContain("submit");
    expect(availableTransitions({ status: "submitted", assigneeId: idA, blocked: true }, "teacher", idB).map((rule) => rule.action)).toEqual(["reject"]);
    expect(availableTransitions({ status: "accepted", assigneeId: idA, reopenBlocked: true }, "teacher", idB)).toEqual([]);
  });
  it("文档行动项保留版本、来源和防重键，日期必须有效", () => {
    const valid = { resourceId: idA, sourceVersion: 2, requestKey: idB, title: "  会后核对  ", dueDate: "2026-10-12" };
    expect(taskActionItemCreateSchema.parse(valid).title).toBe("会后核对");
    expect(taskActionItemCreateSchema.safeParse({ ...valid, sourceVersion: 0 }).success).toBe(false);
    expect(taskActionItemCreateSchema.safeParse({ ...valid, dueDate: "2026-02-30" }).success).toBe(false);
    expect(taskActionItemCreateSchema.safeParse({ ...valid, quote: "a".repeat(2001) }).success).toBe(false);
    expect(taskActionItemCreateSchema.safeParse({ ...valid, requestKey: "invalid" }).success).toBe(false);
  });
});

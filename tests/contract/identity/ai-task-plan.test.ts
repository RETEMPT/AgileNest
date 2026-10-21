import { describe, expect, it } from "vitest";
import { decodeTaskPlan, emptyTaskPlan, encodeTaskPlan, importTaskPlan, prepareTaskPlanPublication, removePlanLeaf, taskPlanOutline, taskPlanPublicationSchema, taskPlanSchema, taskPlanStorageKey, updatePlanNode, writeTaskPlan, type TaskPlan, type TaskPlanNode } from "@/components/ai/task-plan";

function node(id: string, patch: Partial<TaskPlanNode> = {}): TaskPlanNode { return { id, title: `任务 ${id}`, criteria: ["交付可复现结果"], parentId: null, dependsOn: [], ...patch }; }
function plan(...nodes: TaskPlanNode[]): TaskPlan { return { version: 1, nodes }; }

describe("任务规划编辑与明确采纳", () => {
  it("导入实际JSON并保留层级和先后关系，导出文本不虚构创建状态", () => {
    const value = plan(node("a"), node("research"), node("b", { parentId: "a", dependsOn: ["research"] }));
    expect(importTaskPlan(JSON.stringify(value))).toEqual(value);
    const text = encodeTaskPlan(value, "text", { milestoneId: "m", title: "开题" });
    expect(text).toContain("待确认的任务规划"); expect(text).toContain("### 任务 b"); expect(text).toContain("需先完成：任务 research"); expect(text).toContain("开题"); expect(text).not.toContain("模型尚未接入");
  });
  it("拒绝重复任务ID与未知父节点或前置节点", () => {
    expect(() => taskPlanSchema.parse(plan(node("a"), node("a")))).toThrow("标识重复");
    expect(() => taskPlanSchema.parse(plan(node("a", { parentId: "missing" })))).toThrow("父任务不存在");
    expect(() => taskPlanSchema.parse(plan(node("a", { dependsOn: ["missing"] })))).toThrow("需要先完成的任务不存在");
  });
  it("拒绝自依赖、循环以及重复前置", () => {
    expect(() => taskPlanSchema.parse(plan(node("a", { dependsOn: ["a"] })))).toThrow("先后顺序");
    expect(() => taskPlanSchema.parse(plan(node("a", { dependsOn: ["c"] }), node("b", { dependsOn: ["a"] }), node("c", { dependsOn: ["b"] })))).toThrow("首尾相连");
    expect(() => taskPlanSchema.parse(plan(node("a"), node("b", { dependsOn: ["a", "a"] })))).toThrow("重复");
  });
  it("移动到自身/子节点或新增第三层不能通过", () => {
    const value = plan(node("a"), node("b", { parentId: "a" }));
    expect(() => updatePlanNode(value, node("a", { parentId: "b" }))).toThrow("一层子任务");
    expect(() => updatePlanNode(value, node("a", { parentId: "a" }))).toThrow("一层子任务");
    expect(() => taskPlanSchema.parse(plan(...value.nodes, node("c", { parentId: "b" })))).toThrow("一层子任务");
  });
  it("只删除无引用叶子，不静默删除子节点或前置边", () => {
    expect(() => removePlanLeaf(plan(node("a"), node("b", { parentId: "a" })), "a")).toThrow("子任务");
    expect(() => removePlanLeaf(plan(node("a"), node("b", { dependsOn: ["a"] })), "a")).toThrow("先完成");
    expect(removePlanLeaf(plan(node("a"), node("b")), "b").nodes.map((item) => item.id)).toEqual(["a"]);
  });
  it("导入边界拒绝超量任务、过长标题/条目与额外指令字段", () => {
    expect(() => importTaskPlan(JSON.stringify(plan(...Array.from({ length: 41 }, (_, index) => node(`n${index}`)))))).toThrow();
    expect(() => importTaskPlan(JSON.stringify(plan(node("a", { title: "a".repeat(201) }))))).toThrow();
    expect(() => importTaskPlan(JSON.stringify(plan(node("a", { criteria: ["a".repeat(501)] }))))).toThrow();
    expect(() => importTaskPlan('{"version":1,"nodes":[],"execute":true}')).toThrow();
    expect(() => importTaskPlan(JSON.stringify(plan(node("a", { criteria: Array(31).fill("要求") }))))).toThrow();
  });
  it("未命名本地输入可保存，但导入和加入草稿要求有效名称", () => {
    const partial = plan(node("a", { title: "" }));
    expect(decodeTaskPlan(JSON.stringify(partial))).toEqual(partial);
    expect(() => importTaskPlan(JSON.stringify(partial))).toThrow("需要名称");
    expect(() => encodeTaskPlan(partial, "text")).toThrow("需要名称");
    expect(() => encodeTaskPlan(plan(node("a", { criteria: ["重复", "重复"] })), "text")).toThrow("重复");
  });
  it("账号、项目和里程碑的存储键完全隔离且分隔符不能碰撞", () => {
    const keys = [taskPlanStorageKey("u1", "p1"), taskPlanStorageKey("u2", "p1"), taskPlanStorageKey("u1", "p2"), taskPlanStorageKey("u1", "p1", { milestoneId: "m", title: "标题" }), taskPlanStorageKey("u1", "p1", { taskId: "m", title: "来源任务" }), taskPlanStorageKey("u1", "p1", { taskId: "other", title: "其他任务" }), taskPlanStorageKey("u1", "p1", { sourceId: "message-request", title: "对话" }), taskPlanStorageKey("u1", null), taskPlanStorageKey("u:1", "p"), taskPlanStorageKey("u", "1:p")];
    expect(new Set(keys).size).toBe(keys.length);
    expect(taskPlanStorageKey("u", "p", { milestoneId: "m", title: "旧标题" })).toBe(taskPlanStorageKey("u", "p", { milestoneId: "m", title: "新标题" }));
  });
  it("损坏记录拒绝解码，多窗口冲突不覆盖另一份草稿", () => {
    expect(decodeTaskPlan(null)).toEqual(emptyTaskPlan()); expect(() => decodeTaskPlan("broken")).toThrow();
    let raw: string | null = null; const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    const saved = writeTaskPlan(storage, "key", null, plan(node("a")));
    expect(raw).toBe(saved);
    raw = JSON.stringify(plan(node("b")));
    expect(() => writeTaskPlan(storage, "key", saved, plan(node("c")))).toThrow("另一窗口");
    expect(decodeTaskPlan(raw).nodes[0].id).toBe("b");
  });
  it("存储失败抛错并保留原输入和保存基线供重试", () => {
    const value = plan(node("a"));
    const storage = { getItem: () => null, setItem: () => { throw new Error("容量不足"); } };
    expect(() => writeTaskPlan(storage, "key", null, value)).toThrow("容量不足");
    expect(value.nodes[0].title).toBe("任务 a");
  });
  it("规划提纲携带真实上下文和可导入字段，但不生成虚构任务", () => {
    const outline = taskPlanOutline(emptyTaskPlan(), { milestoneId: "m", title: "真实里程碑" });
    expect(outline).toContain("真实里程碑"); expect(outline).toContain('"dependsOn":[]'); expect(outline).toContain("不编造事实"); expect(outline).toContain("需我确认后");
    expect(taskPlanOutline(plan(node("a")))).toContain("交付可复现结果");
  });
  it("发布要求每项验收完整且最多20项，保留原计划和稳定请求ID供失败重试", () => {
    const runId = "c712a16c-2f43-411a-a850-cbe086888885";
    const value = plan(node("a"), node("b", { dependsOn: ["a"] }));
    const batch = prepareTaskPlanPublication(value, runId);
    expect(taskPlanPublicationSchema.parse(JSON.parse(JSON.stringify(batch)))).toEqual({ runId, plan: value });
    expect(() => prepareTaskPlanPublication(plan(node("a", { criteria: [] })), runId)).toThrow("验收要求");
    expect(() => prepareTaskPlanPublication(plan(...Array.from({ length: 21 }, (_, index) => node(`n${index}`))), runId)).toThrow("20");
  });
  it("子任务不能先等主任务验收，跨主子任务的隐式验收顺序也不能首尾相连", () => {
    expect(() => taskPlanSchema.parse(plan(node("main"), node("child", { parentId: "main", dependsOn: ["main"] })))).toThrow("先后顺序");
    expect(() => taskPlanSchema.parse(plan(node("a", { dependsOn: ["b"] }), node("b"), node("child", { parentId: "b", dependsOn: ["a"] })))).toThrow("先后顺序");
  });
});

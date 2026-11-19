import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import type { AcceptanceCriterion, TaskDTO, TaskOrganizationDTO } from "@/modules/tasks";
import { applyTaskPlan } from "@/modules/ai/adoption";
import type { TaskPlan, TaskPlanNode } from "@/modules/ai/client";

const mocks = vi.hoisted(() => ({ access: vi.fn(), milestones: vi.fn(), create: vi.fn(), detail: vi.fn(), delivery: vi.fn(), organization: vi.fn(), change: vi.fn() }));
vi.mock("@/modules/core", async (original) => ({ ...await original<typeof import("@/modules/core")>(), requireProjectForUser: mocks.access }));
vi.mock("@/modules/milestone", () => ({ listMilestones: mocks.milestones }));
vi.mock("@/modules/tasks", () => ({ createTask: mocks.create, getTaskDetail: mocks.detail, getTaskDelivery: mocks.delivery, getTaskOrganization: mocks.organization, changeTaskOrganization: mocks.change }));

const actorId = randomUUID(); const projectId = randomUUID(); const milestoneId = randomUUID();
const node = (id: string, patch: Partial<TaskPlanNode> = {}): TaskPlanNode => ({ id, title: `任务 ${id}`, criteria: ["提交可核验成果"], parentId: null, dependsOn: [], ...patch });
const plan = (...nodes: TaskPlanNode[]): TaskPlan => ({ version: 1, nodes });
const input = (value: TaskPlan, runId = randomUUID()) => ({ projectId, milestoneId, runId, plan: value });
let tasks: Map<string, TaskDTO>; let requirements: Map<string, AcceptanceCriterion[]>;
let edges: { before: string; after: string }[]; let versions: Map<string, number>;
let failCreateAt: number | null; let failOrder: boolean;
function organization(taskId: string): TaskOrganizationDTO {
  const relation = (id: string) => ({ id, title: tasks.get(id)!.title, status: tasks.get(id)!.status, assigneeName: null, canBlock: true });
  return { taskId, projectId, version: versions.get(taskId) ?? 1, canEdit: true, canManageLabels: true, labels: [], projectLabels: [], blockedBy: edges.filter((edge) => edge.after === taskId).map((edge) => ({ id: `${edge.before}:${edge.after}`, task: relation(edge.before), canRemove: true })), blocking: edges.filter((edge) => edge.before === taskId).map((edge) => ({ id: `${edge.before}:${edge.after}`, task: relation(edge.after), canRemove: true })), blocked: false, reopenBlocked: false, candidates: [], candidatesTruncated: false, query: "" };
}
beforeEach(() => {
  vi.clearAllMocks(); tasks = new Map(); requirements = new Map(); edges = []; versions = new Map(); failCreateAt = null; failOrder = false;
  mocks.access.mockResolvedValue({ capabilities: { task: { actions: ["create", "assign"] } } });
  mocks.milestones.mockResolvedValue([{ id: milestoneId }]);
  mocks.detail.mockImplementation(async (_actor: string, taskId: string) => { const task = tasks.get(taskId); if (!task) throw new NotFoundError("任务不存在"); return { ...task, subtasks: [] }; });
  mocks.delivery.mockImplementation(async (_actor: string, taskId: string) => ({ requirements: { version: 1, criteria: requirements.get(taskId) ?? [] }, submissions: [] }));
  mocks.create.mockImplementation(async (_actor: string, targetProject: string, value: { title: string; parentTaskId?: string; milestoneId?: string; requestKey: string; acceptanceCriteria: AcceptanceCriterion[] }) => {
    if (mocks.create.mock.calls.length === failCreateAt) throw new AppError("暂时无法创建，请稍后重试");
    const previous = tasks.get(value.requestKey); if (previous) return previous;
    const task: TaskDTO = { id: value.requestKey, projectId: targetProject, title: value.title, milestoneId: value.milestoneId ?? null, parentTaskId: value.parentTaskId ?? null, status: "unclaimed", description: null, completionNote: null, rejectReason: null, assigneeId: null, assigneeName: null, createdById: actorId, startDate: null, dueDate: null, estimatedMinutes: null, priority: "medium", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
    tasks.set(task.id, task); requirements.set(task.id, value.acceptanceCriteria); return task;
  });
  mocks.organization.mockImplementation(async (_actor: string, taskId: string) => organization(taskId));
  mocks.change.mockImplementation(async (_actor: string, taskId: string, value: { otherTaskId: string; version: number }) => {
    if (failOrder) throw new ConflictError("任务先后已变化，请重试");
    expect(value.version).toBe(versions.get(taskId) ?? 1);
    edges.push({ before: value.otherTaskId, after: taskId });
    versions.set(taskId, value.version + 1); return organization(taskId);
  });
});

describe("AI 规划确认后创建真实项目任务", () => {
  it("先创建主任务再创建子任务，写入真实验收要求后设置先后顺序", async () => {
    const result = await applyTaskPlan(actorId, input(plan(node("child", { parentId: "main", dependsOn: ["research"] }), node("main"), node("research"))));
    expect(result.complete).toBe(true); expect(result.tasks).toHaveLength(3);
    expect(mocks.create.mock.calls.map((call) => call[2].title)).toEqual(["任务 main", "任务 research", "任务 child"]);
    const child = result.tasks.find((item) => item.nodeId === "child")!; const main = result.tasks.find((item) => item.nodeId === "main")!;
    expect(tasks.get(child.taskId)?.parentTaskId).toBe(main.taskId);
    expect(requirements.get(child.taskId)?.[0].text).toBe("提交可核验成果"); expect(edges).toEqual([{ before: result.tasks.find((item) => item.nodeId === "research")!.taskId, after: child.taskId }]);
    expect([...tasks.values()].every((task) => task.status === "unclaimed" && task.assigneeId === null && task.description === null)).toBe(true);
  });
  it("同一批规划重试不重复创建任务或先后关系", async () => {
    const value = input(plan(node("a"), node("b", { dependsOn: ["a"] })));
    const first = await applyTaskPlan(actorId, value); const second = await applyTaskPlan(actorId, value);
    expect(second).toEqual(first); expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.change).toHaveBeenCalledTimes(1);
  });
  it("中途创建失败返回已建任务，原请求重试只补建未完成任务", async () => {
    const value = input(plan(node("a"), node("b"))); failCreateAt = 2;
    const first = await applyTaskPlan(actorId, value);
    expect(first).toMatchObject({ complete: false, error: "暂时无法创建，请稍后重试" }); expect(first.tasks).toHaveLength(1); expect(tasks.size).toBe(1);
    failCreateAt = null; const second = await applyTaskPlan(actorId, value);
    expect(second.complete).toBe(true); expect(tasks.size).toBe(2); expect(second.tasks[0]).toEqual(first.tasks[0]); expect(mocks.create).toHaveBeenCalledTimes(3);
  });
  it("先后顺序写入失败保留全部已建任务，重试不重新创建", async () => {
    const value = input(plan(node("a"), node("b", { dependsOn: ["a"] }))); failOrder = true;
    const first = await applyTaskPlan(actorId, value); expect(first.complete).toBe(false); expect(first.tasks).toHaveLength(2);
    failOrder = false; expect((await applyTaskPlan(actorId, value)).complete).toBe(true); expect(mocks.create).toHaveBeenCalledTimes(2); expect(edges).toHaveLength(1);
  });
  it("越权账号不读取任务或里程碑且不创建", async () => {
    mocks.access.mockRejectedValueOnce(new ForbiddenError());
    await expect(applyTaskPlan(actorId, input(plan(node("a"))))).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.milestones).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("跨项目里程碑在任何写入前被拒绝", async () => {
    mocks.milestones.mockResolvedValueOnce([{ id: randomUUID() }]);
    await expect(applyTaskPlan(actorId, input(plan(node("a"))))).rejects.toThrow("当前项目"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("创建前完整校验验收要求、任务先后和每批数量", async () => {
    for (const invalid of [plan(node("a", { criteria: [] })), plan(node("a", { dependsOn: ["a"] })), plan(...Array.from({ length: 21 }, (_, index) => node(`n${index}`)))]) {
      await expect(applyTaskPlan(actorId, input(invalid))).rejects.toBeInstanceOf(AppError);
    }
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.change).not.toHaveBeenCalled();
  });
  it("缺少设置先后顺序权限时在全批创建前拒绝，不自动替用户认领", async () => {
    mocks.access.mockResolvedValueOnce({ capabilities: { task: { actions: ["create", "claim"] } } });
    await expect(applyTaskPlan(actorId, input(plan(node("a"), node("b", { dependsOn: ["a"] }))))).rejects.toBeInstanceOf(ForbiddenError); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("复用runId更改尚未创建的任务或全部节点ID均返回409，不覆盖或增建", async () => {
    const value = input(plan(node("a"), node("b"))); failCreateAt = 2; await applyTaskPlan(actorId, value); failCreateAt = null;
    await expect(applyTaskPlan(actorId, { ...value, plan: plan(node("a"), node("b", { title: "已改变目标" })) })).rejects.toBeInstanceOf(ConflictError);
    await expect(applyTaskPlan(actorId, { ...value, plan: plan(node("new-a"), node("new-b")) })).rejects.toBeInstanceOf(ConflictError);
    expect(tasks.size).toBe(1); expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("已创建任务被编辑或开始执行后重试返回409，保留人工变更", async () => {
    const value = input(plan(node("a"))); const first = await applyTaskPlan(actorId, value); const taskId = first.tasks[0].taskId;
    tasks.set(taskId, { ...tasks.get(taskId)!, status: "in_progress", assigneeId: actorId });
    await expect(applyTaskPlan(actorId, value)).rejects.toBeInstanceOf(ConflictError); expect(tasks.get(taskId)?.status).toBe("in_progress"); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

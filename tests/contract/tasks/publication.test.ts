import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject, joinTeam } from "@/modules/identity";
import { listTaskEvents } from "@/modules/review";
import { createTask, getTaskDelivery, getTaskDetail, listProjectTasks, saveTaskRequirements, transitionTask, updateTask, availableTransitions, createSubtask } from "@/modules/tasks";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("发布到验收的成熟业务守卫", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  const criteria = () => [{ id: randomUUID(), text: "研究报告包含来源、结论和材料索引" }];
  async function published() { return createTask(fx.admin.id, fx.project.id, { title: "发布研究任务", assigneeId: fx.student.id, acceptanceCriteria: criteria() }); }
  it("发布任务、姓名指派及验收要求同事务写入，执行人立即看到同份清单", async () => { const task = await published(); expect(task).toMatchObject({ assigneeId: fx.student.id, status: "in_progress" }); expect((await getTaskDelivery(fx.student.id, task.id)).requirements).toMatchObject({ version: 1, criteria: [{ text: "研究报告包含来源、结论和材料索引" }] }); });
  it("新发布、提交、打回重交和验收事件与任务时刻一致，旧提交时间不被改写", async () => {
    const startedAt = Date.now(); const task = await published();
    const initialEvents = await listTaskEvents(fx.admin.id, task.id);
    expect(task.createdAt.toISOString()).toBe(task.updatedAt.toISOString());
    expect(initialEvents.find((event) => event.action === "create")?.createdAt.toISOString()).toBe(task.createdAt.toISOString());
    expect(initialEvents.find((event) => event.action === "assign")?.createdAt.toISOString()).toBe(task.createdAt.toISOString());
    const submitted = await submitEvidence(fx.student.id, task.id, "提交可核对的研究报告");
    const first = (await getTaskDelivery(fx.admin.id, task.id)).submissions[0];
    expect(first.submittedAt).toBe(submitted.updatedAt.toISOString());
    const rejected = await reviewEvidence(fx.teacher.id, task.id, "reject", "补充原始材料索引与核对结果");
    const rejectedFirst = (await getTaskDelivery(fx.admin.id, task.id)).submissions[0];
    expect(rejectedFirst.review?.reviewedAt).toBe(rejected.updatedAt.toISOString());
    const resubmitted = await submitEvidence(fx.student.id, task.id, "原始材料索引已补齐", "resubmit");
    const accepted = await reviewEvidence(fx.teacher.id, task.id);
    const history = (await getTaskDelivery(fx.admin.id, task.id)).submissions;
    expect(history[0].submittedAt).toBe(resubmitted.updatedAt.toISOString());
    expect(history[0].review?.reviewedAt).toBe(accepted.updatedAt.toISOString());
    expect(history[1]).toEqual(rejectedFirst);
    const events = await listTaskEvents(fx.admin.id, task.id);
    for (const [action, time] of [["submit", first.submittedAt], ["reject", rejected.updatedAt.toISOString()], ["resubmit", history[0].submittedAt], ["accept", accepted.updatedAt.toISOString()]]) {
      expect(events.find((event) => event.action === action)?.createdAt.toISOString()).toBe(time);
      expect(Date.parse(time)).toBeGreaterThanOrEqual(startedAt - 1000);
      expect(Date.parse(time)).toBeLessThanOrEqual(Date.now() + 1000);
    }
    expect(Date.parse(task.createdAt.toISOString())).toBeGreaterThanOrEqual(startedAt - 1000);
  });
  it("发布清单空白或重复拒绝，不留下半成品任务", async () => { const list = criteria(); for (const value of [[], [list[0], list[0]], [{ ...list[0], text: " " }]]) await expect(createTask(fx.admin.id, fx.project.id, { title: "应回滚", acceptanceCriteria: value })).rejects.toBeInstanceOf(AppError); expect(await listProjectTasks(fx.admin.id, fx.project.id)).toEqual([]); });
  it("不能将已发布任务的验收要求清空，原清单与版本保留", async () => { const task = await published(); await expect(saveTaskRequirements(fx.admin.id, task.id, { version: 1, criteria: [] })).rejects.toBeInstanceOf(AppError); expect((await getTaskDelivery(fx.admin.id, task.id)).requirements).toMatchObject({ version: 1, criteria: [{ text: "研究报告包含来源、结论和材料索引" }] }); });
  it("组员不能发布时指派他人，越权失败不写任务和验收要求", async () => { await joinTeam(fx.outsider.id, fx.team.inviteCode); await expect(createTask(fx.student.id, fx.project.id, { title: "越权指派", assigneeId: fx.outsider.id, acceptanceCriteria: criteria() })).rejects.toBeInstanceOf(ForbiddenError); expect(await listProjectTasks(fx.admin.id, fx.project.id)).toEqual([]); });
  it("同一次发布重试不会重复任务、事件或覆盖首次要求", async () => { const requestKey = randomUUID(); const first = await createTask(fx.admin.id, fx.project.id, { title: "首次发布", acceptanceCriteria: criteria(), requestKey }); const retry = await createTask(fx.admin.id, fx.project.id, { title: "重试不要覆盖", acceptanceCriteria: criteria(), requestKey }); expect(retry.id).toBe(first.id); expect(retry.title).toBe("首次发布"); expect(await listProjectTasks(fx.admin.id, fx.project.id)).toHaveLength(1); expect((await getTaskDelivery(fx.admin.id, first.id)).requirements.version).toBe(1); });
  it("他人或其他项目不能接管已经使用的发布请求", async () => { const requestKey = randomUUID(); await createTask(fx.admin.id, fx.project.id, { title: "原任务", requestKey }); await expect(createTask(fx.teacher.id, fx.project.id, { title: "接管", requestKey })).rejects.toBeInstanceOf(ConflictError); const other = await createProject(fx.admin.id, fx.team.id, { name: "其他研究" }); await expect(createTask(fx.admin.id, other.id, { title: "接管", requestKey })).rejects.toBeInstanceOf(ConflictError); });
  it("待验收及已完成冻结目标与要求，但排期仍可调整，打回或重开后可改", async () => {
    const task = await published(); await submitEvidence(fx.student.id, task.id, "提交研究材料"); const original = (await getTaskDelivery(fx.admin.id, task.id)).requirements;
    await expect(saveTaskRequirements(fx.admin.id, task.id, { version: original.version, criteria: criteria() })).rejects.toBeInstanceOf(ConflictError); await expect(updateTask(fx.admin.id, task.id, { description: "更换工作范围" })).rejects.toBeInstanceOf(ConflictError);
    await updateTask(fx.admin.id, task.id, { dueDate: "2026-11-20" }); await reviewEvidence(fx.teacher.id, task.id, "reject", "补充原始材料索引"); const next = await saveTaskRequirements(fx.admin.id, task.id, { version: original.version, criteria: criteria() }); expect(next.version).toBe(2);
    await submitEvidence(fx.student.id, task.id, "已补齐索引", "resubmit"); await reviewEvidence(fx.teacher.id, task.id); await expect(saveTaskRequirements(fx.admin.id, task.id, { version: 2, criteria: criteria() })).rejects.toBeInstanceOf(ConflictError); await transitionTask(fx.teacher.id, task.id, "reopen"); await expect(updateTask(fx.admin.id, task.id, { description: "新增研究阶段" })).resolves.toMatchObject({ description: "新增研究阶段" });
  });
  it("编辑携带旧版本拒绝覆盖他人变更，原目标保留", async () => { const task = await published(); await updateTask(fx.admin.id, task.id, { title: "管理员新目标" }, task.updatedAt.toISOString()); await expect(updateTask(fx.student.id, task.id, { title: "旧草稿" }, task.updatedAt.toISOString())).rejects.toBeInstanceOf(ConflictError); expect((await getTaskDetail(fx.admin.id, task.id)).title).toBe("管理员新目标"); });
  it("父任务子项未全部通过时统一动作隐藏通过，服务端仍返回409", async () => { const parent = await published(); await createSubtask(fx.admin.id, parent.id, { title: "材料核对", acceptanceCriteria: criteria() }); await submitEvidence(fx.student.id, parent.id, "父任务提交"); const detail = await getTaskDetail(fx.teacher.id, parent.id); expect(detail.acceptBlocked).toBe(true); expect(availableTransitions(detail, "teacher", fx.teacher.id).map((rule) => rule.action)).toEqual(["reject"]); expect((await listProjectTasks(fx.teacher.id, fx.project.id)).find((item) => item.id === parent.id)?.acceptBlocked).toBe(true); await expect(reviewEvidence(fx.teacher.id, parent.id)).rejects.toBeInstanceOf(ConflictError); });
  it("负责人重新指派后旧负责人不能提交，新负责人按同份要求执行", async () => { const task = await published(); await joinTeam(fx.outsider.id, fx.team.inviteCode); await transitionTask(fx.teacher.id, task.id, "assign", { assigneeId: fx.outsider.id }); await expect(submitEvidence(fx.student.id, task.id, "旧负责人提交")).rejects.toBeInstanceOf(ForbiddenError); await submitEvidence(fx.outsider.id, task.id, "新负责人完成材料"); expect((await getTaskDelivery(fx.teacher.id, task.id)).submissions[0].submittedById).toBe(fx.outsider.id); });
});

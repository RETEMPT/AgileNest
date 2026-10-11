import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject, updateMemberPositions } from "@/modules/identity";
import { uploadResource } from "@/modules/resources";
import { createTask, deleteTask, getApprovedTaskSubmission, getTaskDelivery, listApprovedTaskSubmissions, saveTaskRequirements, transitionTask } from "@/modules/tasks";
import { createDeliveryBatch, exportDeliveryRecord, getDeliveryBatch, getProjectDeliveries, mutateDeliveryBatch, type DeliveryBatchInput } from "@/modules/delivery";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

describe("通用阶段交付、证据与历史保护", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  const data = (ownerId: string | null): DeliveryBatchInput => ({ name: "研究中期材料", description: "报告、原始材料和评审问题统一核对", ownerId, dueDate: "2026-10-31", checklist: [{ id: randomUUID(), text: "报告与通过版本对应", checked: true, note: "已核对" }] });
  async function batch() { const id = await createDeliveryBatch(fx.admin.id, fx.project.id, data(fx.student.id)); return getDeliveryBatch(fx.admin.id, id); }
  async function approved(projectId = fx.project.id, parentTaskId?: string) {
    const task = await createTask(fx.admin.id, projectId, { title: "研究成果报告", assigneeId: fx.student.id, ...(parentTaskId ? { parentTaskId } : {}) });
    await submitEvidence(fx.student.id, task.id, "研究结论已整理并有来源记录"); await reviewEvidence(fx.teacher.id, task.id);
    return { task, submission: (await getTaskDelivery(fx.admin.id, task.id)).submissions[0] };
  }
  async function bound() { const stage = await batch(); const source = await approved(); const updated = await mutateDeliveryBatch(fx.admin.id, stage.id, { op: "bind", version: stage.version, taskId: source.task.id, submissionId: source.submission.id }); return { stage: updated, ...source }; }

  it("创建研究交付并保存独立版本，旧版本不能覆盖", async () => { const stage = await batch(); expect(stage).toMatchObject({ version: 1, status: "draft", ownerName: fx.student.name }); const next = await mutateDeliveryBatch(fx.admin.id, stage.id, { op: "edit", version: stage.version, data: { ...data(fx.student.id), name: "中期结项报告" } }); expect(next.version).toBe(2); expect(next.records.map((record) => record.version)).toEqual([2, 1]); await expect(mutateDeliveryBatch(fx.admin.id, stage.id, { op: "archive", version: 1 })).rejects.toBeInstanceOf(ConflictError); });
  it("批次、材料、问题和完成记录使用同一操作时刻，不受数据库会话时区影响", async () => {
    const startedAt = Date.now(); const source = await bound();
    let stage = await mutateDeliveryBatch(fx.admin.id, source.stage.id, { op: "issue", version: source.stage.version, title: "核对资料目录", detail: "确认报告目录与附件对应", ownerId: fx.student.id, taskId: source.task.id });
    expect(stage.issues[0].updatedAt).toBe(stage.records[0].createdAt);
    const issue = stage.issues[0]; stage = await mutateDeliveryBatch(fx.student.id, stage.id, { op: "resolve", version: stage.version, issueId: issue.id, issueVersion: issue.version, resolution: "资料目录与附件逐项一致" });
    expect(stage.issues[0].updatedAt).toBe(stage.records[0].createdAt);
    const completed = await mutateDeliveryBatch(fx.teacher.id, stage.id, { op: "complete", version: stage.version });
    expect(completed.completedAt).not.toBeNull();
    expect(Math.abs(Date.parse(completed.records[0].createdAt) - Date.parse(completed.completedAt!))).toBeLessThan(1000);
    expect(completed.updatedAt).toBe(completed.completedAt);
    expect(completed.records.find((record) => record.action === "create")?.createdAt).toBe(completed.createdAt);
    expect(completed.records.find((record) => record.action === "bind")?.createdAt).toBe(completed.entries[0].createdAt);
    for (const time of [completed.createdAt, completed.completedAt!, ...completed.records.map((record) => record.createdAt)]) {
      expect(Date.parse(time)).toBeGreaterThanOrEqual(startedAt - 1000);
      expect(Date.parse(time)).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });
  it("成员能读、非成员不能读写，组员不能整理或确认", async () => { const stage = await batch(); expect((await getProjectDeliveries(fx.student.id, fx.project.id)).batches).toHaveLength(1); await expect(getDeliveryBatch(fx.outsider.id, stage.id)).rejects.toBeInstanceOf(ForbiddenError); await expect(createDeliveryBatch(fx.student.id, fx.project.id, data(fx.student.id))).rejects.toBeInstanceOf(ForbiddenError); await expect(mutateDeliveryBatch(fx.student.id, stage.id, { op: "complete", version: 1 })).rejects.toBeInstanceOf(ForbiddenError); });
  it("边界拒绝虚假日期和团队外责任人", async () => { await expect(createDeliveryBatch(fx.admin.id, fx.project.id, { ...data(fx.student.id), dueDate: "2026-02-31" })).rejects.toBeInstanceOf(AppError); await expect(createDeliveryBatch(fx.admin.id, fx.project.id, data(fx.outsider.id))).rejects.toBeInstanceOf(AppError); });
  it("新建响应丢失后重试返回原批次，不覆盖内容或增加记录", async () => { const key = randomUUID(); const id = await createDeliveryBatch(fx.admin.id, fx.project.id, data(fx.student.id), key); expect(await createDeliveryBatch(fx.admin.id, fx.project.id, { ...data(fx.student.id), name: "重复请求不应覆盖" }, key)).toBe(id); const stage = await getDeliveryBatch(fx.admin.id, id); expect(stage.name).toBe("研究中期材料"); expect(stage.records).toHaveLength(1); });
  it("其他账号或项目不能通过新建请求键接管批次", async () => { const key = randomUUID(); await createDeliveryBatch(fx.admin.id, fx.project.id, data(fx.student.id), key); await expect(createDeliveryBatch(fx.teacher.id, fx.project.id, data(fx.student.id), key)).rejects.toBeInstanceOf(ConflictError); const other = await createProject(fx.admin.id, fx.team.id, { name: "独立研究", kind: "lab" }); await expect(createDeliveryBatch(fx.admin.id, other.id, data(fx.student.id), key)).rejects.toBeInstanceOf(ConflictError); });
  it("只绑定当前项目真实通过版本，未验收、伪造或跨项目均拒绝", async () => {
    const stage = await batch(); const open = await createTask(fx.admin.id, fx.project.id, { title: "未完成报告" });
    await expect(mutateDeliveryBatch(fx.admin.id, stage.id, { op: "bind", version: 1, taskId: open.id, submissionId: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    const other = await createProject(fx.admin.id, fx.team.id, { name: "其他课题", kind: "lab" }); const source = await approved(other.id);
    await expect(mutateDeliveryBatch(fx.admin.id, stage.id, { op: "bind", version: 1, taskId: source.task.id, submissionId: source.submission.id })).rejects.toThrow("当前项目");
    expect((await getDeliveryBatch(fx.admin.id, stage.id)).entries).toEqual([]);
  });
  it("绑定真实通过的附件提交快照，重复关联返回409", async () => {
    const stage = await batch(); const task = await createTask(fx.admin.id, fx.project.id, { title: "课程报告", assigneeId: fx.student.id });
    const file = await uploadResource(fx.student.id, { projectId: fx.project.id }, { name: "课程报告.txt", bytes: new TextEncoder().encode("真实课程报告") });
    const requirements = await saveTaskRequirements(fx.admin.id, task.id, { version: 0, criteria: [{ id: randomUUID(), text: "课程报告材料齐全" }] });
    await transitionTask(fx.student.id, task.id, "submit", { delivery: { requirementsVersion: requirements.version, summary: "报告已完成", verification: "逐项核对课程要求", links: [], resourceIds: [file.id], checks: requirements.criteria.map((item) => ({ criterionId: item.id, met: true })) } }); await reviewEvidence(fx.teacher.id, task.id);
    const submission = (await getTaskDelivery(fx.admin.id, task.id)).submissions[0]; const next = await mutateDeliveryBatch(fx.admin.id, stage.id, { op: "bind", version: 1, taskId: task.id, submissionId: submission.id });
    expect(next.entries[0].submission.resources[0].id).toBe(file.id); expect(next.entries[0].submission.review?.action).toBe("accept");
    await expect(mutateDeliveryBatch(fx.admin.id, stage.id, { op: "bind", version: next.version, taskId: task.id, submissionId: submission.id })).rejects.toBeInstanceOf(ConflictError);
  });
  it("确认必须有成果、全清单和已解决问题，问题本人可以处理", async () => {
    const initial = await batch(); await expect(mutateDeliveryBatch(fx.teacher.id, initial.id, { op: "complete", version: 1 })).rejects.toBeInstanceOf(ConflictError);
    const source = await approved(); let stage = await mutateDeliveryBatch(fx.admin.id, initial.id, { op: "bind", version: 1, taskId: source.task.id, submissionId: source.submission.id });
    stage = await mutateDeliveryBatch(fx.admin.id, stage.id, { op: "issue", version: stage.version, title: "缺文献索引", detail: "报告第2节补齐原文链接并核对出处", ownerId: fx.student.id, taskId: source.task.id });
    await expect(mutateDeliveryBatch(fx.teacher.id, stage.id, { op: "complete", version: stage.version })).rejects.toBeInstanceOf(ConflictError);
    const issue = stage.issues[0]; stage = await mutateDeliveryBatch(fx.student.id, stage.id, { op: "resolve", version: stage.version, issueId: issue.id, issueVersion: issue.version, resolution: "第2节补充文献索引并逐项核对，报告v1附录可查看" });
    stage = await mutateDeliveryBatch(fx.teacher.id, stage.id, { op: "complete", version: stage.version }); expect(stage.status).toBe("completed"); expect(stage.records[0].action).toBe("complete");
  });
  it("已确认记录不可覆盖，任务重开标明当前变化且历史快照不变", async () => {
    const source = await bound(); const completed = await mutateDeliveryBatch(fx.teacher.id, source.stage.id, { op: "complete", version: source.stage.version });
    const before = await exportDeliveryRecord(fx.admin.id, completed.id, completed.version, "json");
    await expect(mutateDeliveryBatch(fx.admin.id, completed.id, { op: "edit", version: completed.version, data: data(fx.student.id) })).rejects.toBeInstanceOf(ConflictError);
    await transitionTask(fx.teacher.id, source.task.id, "reopen"); const current = await getDeliveryBatch(fx.admin.id, completed.id); expect(current.entries[0].currentTaskStatus).toBe("in_progress"); expect(current.status).toBe("completed");
    expect((await exportDeliveryRecord(fx.admin.id, completed.id, completed.version, "json")).body).toBe(before.body);
    const reopened = await mutateDeliveryBatch(fx.teacher.id, completed.id, { op: "reopen", version: completed.version }); expect(reopened.checklist.every((item) => !item.checked)).toBe(true);
  });
  it("归档后只读，恢复保留全部记录且不能重复恢复", async () => { const source = await bound(); const archived = await mutateDeliveryBatch(fx.admin.id, source.stage.id, { op: "archive", version: source.stage.version }); await expect(mutateDeliveryBatch(fx.admin.id, archived.id, { op: "unbind", version: archived.version, entryId: archived.entries[0].id })).rejects.toBeInstanceOf(ConflictError); const restored = await mutateDeliveryBatch(fx.admin.id, archived.id, { op: "restore", version: archived.version }); expect(restored.archived).toBe(false); expect(restored.records.map((record) => record.action)).toEqual(["restore", "archive", "bind", "create"]); await expect(mutateDeliveryBatch(fx.admin.id, restored.id, { op: "restore", version: restored.version })).rejects.toBeInstanceOf(ConflictError); });
  it("并发相同版本只写一个变更，不覆盖清单", async () => { const stage = await batch(); const results = await Promise.allSettled([mutateDeliveryBatch(fx.admin.id, stage.id, { op: "archive", version: 1 }), mutateDeliveryBatch(fx.admin.id, stage.id, { op: "edit", version: 1, data: { ...data(fx.student.id), name: "新名称" } })]); expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1); expect((await getDeliveryBatch(fx.admin.id, stage.id)).records).toHaveLength(2); });
  it("引用任务不能删除，移除当前关联也不能毁掉历史交付", async () => { const source = await bound(); await expect(deleteTask(fx.admin.id, source.task.id)).rejects.toBeInstanceOf(ConflictError); const stage = await mutateDeliveryBatch(fx.admin.id, source.stage.id, { op: "unbind", version: source.stage.version, entryId: source.stage.entries[0].id }); expect(stage.entries).toEqual([]); await expect(deleteTask(fx.admin.id, source.task.id)).rejects.toBeInstanceOf(ConflictError); });
  it("队长可整理实验室交付但不能验收，副管理员可确认，撤权立即失效", async () => { await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["leader", "member"]); const project = await createProject(fx.admin.id, fx.team.id, { name: "研究课题", kind: "lab" }); const id = await createDeliveryBatch(fx.student.id, project.id, data(fx.student.id)); await expect(mutateDeliveryBatch(fx.student.id, id, { op: "complete", version: 1 })).rejects.toBeInstanceOf(ForbiddenError); await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["deputy", "member"]); expect((await getDeliveryBatch(fx.student.id, id)).canConfirm).toBe(true); await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["member"]); await expect(mutateDeliveryBatch(fx.student.id, id, { op: "archive", version: 1 })).rejects.toBeInstanceOf(ForbiddenError); });
  it("公开通过版本 getter 拒绝非成员和错误版本，候选来自真实验收", async () => { const source = await approved(); expect((await listApprovedTaskSubmissions(fx.student.id, fx.project.id))[0].submission.id).toBe(source.submission.id); await expect(getApprovedTaskSubmission(fx.outsider.id, fx.project.id, source.task.id, source.submission.id)).rejects.toBeInstanceOf(ForbiddenError); await expect(getApprovedTaskSubmission(fx.admin.id, fx.project.id, source.task.id, randomUUID())).rejects.toBeInstanceOf(ConflictError); });
});

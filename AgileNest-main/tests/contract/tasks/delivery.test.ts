import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createTeam, createProject, joinTeam } from "@/modules/identity";
import { uploadResource } from "@/modules/resources";
import { createTask, getTaskDelivery, getTaskDetail, saveTaskRequirements, transitionTask, type DeliveryInput, type ReviewInput } from "@/modules/tasks";
import { listTaskEvents } from "@/modules/review";
import { makeFixture, resetDb } from "../../helpers";
import { submitEvidence, reviewEvidence } from "../../delivery-fixtures";

describe("结构化成果、不可变版本与逐项验收", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });

  async function readyTask() {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "实现可验收成果", assigneeId: fx.student.id });
    const requirements = await saveTaskRequirements(fx.teacher.id, task.id, { version: 0, criteria: [{ id: randomUUID(), text: "关键场景验证通过" }] });
    const delivery: DeliveryInput = {
      requirementsVersion: requirements.version, summary: "功能已实现", verification: "执行关键场景测试，全部通过",
      links: [{ title: "成果报告", url: "https://example.test/report" }], resourceIds: [],
      checks: requirements.criteria.map((criterion) => ({ criterionId: criterion.id, met: true, note: "结果见报告" })),
    };
    return { task, requirements, delivery };
  }

  async function reviewFor(taskId: string, passed = true): Promise<ReviewInput> {
    const { submissions } = await getTaskDelivery(fx.teacher.id, taskId);
    return { submissionId: submissions[0].id, summary: passed ? "核对结果通过" : "请补充失败场景测试", checks: submissions[0].criteria.map((criterion) => ({ criterionId: criterion.id, passed, note: passed ? "已核对" : "失败场景报告缺少异常输入验证，请补充步骤和结果" })) };
  }

  it("完整提交并逐项验收，状态、版本、评审和事件一致", async () => {
    const { task, delivery } = await readyTask();
    await transitionTask(fx.student.id, task.id, "submit", { delivery });
    const first = (await getTaskDelivery(fx.student.id, task.id)).submissions[0];
    expect(first).toMatchObject({ version: 1, source: "structured", summary: delivery.summary, verification: delivery.verification, submittedById: fx.student.id, resources: [] });
    expect(first.criteria[0]).toMatchObject({ text: "关键场景验证通过", met: true });
    await transitionTask(fx.teacher.id, task.id, "accept", { review: await reviewFor(task.id) });
    expect((await getTaskDetail(fx.admin.id, task.id)).status).toBe("accepted");
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions[0].review?.action).toBe("accept");
    expect((await listTaskEvents(fx.admin.id, task.id)).at(-1)).toMatchObject({ action: "accept", note: "核对结果通过" });
  });

  it("缺验证、缺证据、缺逐项自检均不写提交或流转事件", async () => {
    const { task, delivery } = await readyTask();
    for (const patch of [{ verification: " " }, { links: [], resourceIds: [] }, { checks: [] }, { checks: [...delivery.checks, ...delivery.checks] }]) {
      await expect(transitionTask(fx.student.id, task.id, "submit", { delivery: { ...delivery, ...patch } })).rejects.toBeInstanceOf(AppError);
    }
    expect((await getTaskDetail(fx.admin.id, task.id)).status).toBe("in_progress");
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions).toEqual([]);
    expect((await listTaskEvents(fx.admin.id, task.id)).some((event) => event.action === "submit")).toBe(false);
  });

  it("陈旧要求版本和陈旧保存返回409，原内容保留", async () => {
    const { task, requirements, delivery } = await readyTask();
    await saveTaskRequirements(fx.teacher.id, task.id, { version: requirements.version, criteria: requirements.criteria.map((criterion) => ({ ...criterion, text: "新增边界场景也需通过" })) });
    await expect(transitionTask(fx.student.id, task.id, "submit", { delivery })).rejects.toBeInstanceOf(ConflictError);
    await expect(saveTaskRequirements(fx.admin.id, task.id, requirements)).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDelivery(fx.admin.id, task.id)).requirements.criteria[0].text).toBe("新增边界场景也需通过");
  });

  it("并发提交只产生一个版本和一个提交事件", async () => {
    const { task, delivery } = await readyTask();
    const results = await Promise.allSettled([transitionTask(fx.student.id, task.id, "submit", { delivery }), transitionTask(fx.student.id, task.id, "submit", { delivery })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions).toHaveLength(1);
    expect((await listTaskEvents(fx.admin.id, task.id)).filter((event) => event.action === "submit")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("打回重交生成v2，旧版本说明、要求和评审不可变", async () => {
    const { task, requirements, delivery } = await readyTask();
    await transitionTask(fx.student.id, task.id, "submit", { delivery });
    await reviewEvidence(fx.teacher.id, task.id, "reject", "补充异常用例");
    const first = (await getTaskDelivery(fx.admin.id, task.id)).submissions[0];
    await saveTaskRequirements(fx.teacher.id, task.id, { version: requirements.version, criteria: [{ id: randomUUID(), text: "异常用例验证通过" }] });
    await submitEvidence(fx.student.id, task.id, "已补异常用例", "resubmit");
    const history = (await getTaskDelivery(fx.admin.id, task.id)).submissions;
    expect(history.map((submission) => submission.version)).toEqual([2, 1]);
    expect(history[1]).toEqual(first);
    expect(history[0].criteria[0].text).toBe("异常用例验证通过");
  });

  it("只能评审当前版本，旧版本不影响v2状态与评审", async () => {
    const { task, delivery } = await readyTask();
    await transitionTask(fx.student.id, task.id, "submit", { delivery });
    const old = await reviewFor(task.id);
    await reviewEvidence(fx.teacher.id, task.id, "reject", "需修改");
    await submitEvidence(fx.student.id, task.id, "第二版", "resubmit");
    await expect(transitionTask(fx.teacher.id, task.id, "accept", { review: old })).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDetail(fx.admin.id, task.id)).status).toBe("submitted");
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions[0].review).toBeNull();
  });

  it("验收通过要求全部项确认，打回必须有修改要求", async () => {
    const { task, delivery } = await readyTask();
    await transitionTask(fx.student.id, task.id, "submit", { delivery });
    const failed = await reviewFor(task.id, false);
    await expect(transitionTask(fx.teacher.id, task.id, "accept", { review: failed })).rejects.toBeInstanceOf(AppError);
    await expect(transitionTask(fx.teacher.id, task.id, "reject", { review: { ...failed, summary: " " } })).rejects.toBeInstanceOf(AppError);
    await expect(transitionTask(fx.teacher.id, task.id, "accept", { review: { ...failed, checks: [] } })).rejects.toBeInstanceOf(AppError);
    await expect(transitionTask(fx.teacher.id, task.id, "reject", { review: { ...failed, checks: failed.checks.map((item) => ({ ...item, note: "" })) } })).rejects.toBeInstanceOf(AppError);
    await expect(transitionTask(fx.teacher.id, task.id, "reject", { review: await reviewFor(task.id) })).rejects.toBeInstanceOf(AppError);
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions[0].review).toBeNull();
  });

  it("非成员不能读或设要求，其他执行成员不能代提交", async () => {
    const { task, requirements, delivery } = await readyTask();
    await expect(getTaskDelivery(fx.outsider.id, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveTaskRequirements(fx.outsider.id, task.id, requirements)).rejects.toBeInstanceOf(ForbiddenError);
    await joinTeam(fx.outsider.id, fx.team.inviteCode);
    await expect(transitionTask(fx.outsider.id, task.id, "submit", { delivery })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(transitionTask(fx.teacher.id, task.id, "submit", { delivery })).rejects.toBeInstanceOf(ForbiddenError);
    await transitionTask(fx.student.id, task.id, "submit", { delivery });
    await expect(transitionTask(fx.student.id, task.id, "accept", { review: await reviewFor(task.id) })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("跨团队文件拒绝关联，整个提交事务回滚", async () => {
    const { task, delivery } = await readyTask();
    const team = await createTeam(fx.outsider.id, "另一团队");
    const project = await createProject(fx.outsider.id, team.id, { name: "其他项目" });
    const file = await uploadResource(fx.outsider.id, { projectId: project.id }, { name: "成果.txt", bytes: new TextEncoder().encode("不可见成果") });
    await expect(transitionTask(fx.student.id, task.id, "submit", { delivery: { ...delivery, links: [], resourceIds: [file.id] } })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions).toEqual([]);
    expect((await getTaskDetail(fx.admin.id, task.id)).status).toBe("in_progress");
  });

  it("升级前待验收任务只能显式评审历史快照，不伪造证据", async () => {
    const submittedAt = new Date("2026-10-01T10:00:00Z");
    // 模拟升级前保存的待验收记录，不通过新提交接口伪造证据。
    const [task] = await db.insert(tasks).values({ projectId: fx.project.id, title: "历史成果", status: "submitted", assigneeId: fx.student.id, submittedAt, completionNote: "原完成说明" }).returning();
    const legacy = (await getTaskDelivery(fx.teacher.id, task.id)).submissions[0];
    expect(legacy).toMatchObject({ source: "legacy", verification: "", links: [], resources: [], criteria: [], summary: "原完成说明" });
    await expect(transitionTask(fx.teacher.id, task.id, "accept", { review: { submissionId: randomUUID(), summary: "核对历史成果", checks: [] } })).rejects.toBeInstanceOf(ConflictError);
    await transitionTask(fx.teacher.id, task.id, "accept", { review: { submissionId: legacy.id, summary: "已核对历史成果", checks: [] } });
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions[0]).toMatchObject({ source: "legacy", links: [], verification: "", review: { action: "accept" } });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { moveTask } from "@/modules/board";
import { createTask, getTaskDelivery, getTaskDetail, saveTaskRequirements } from "@/modules/tasks";
import type { DeliveryInput, ReviewInput } from "@/modules/tasks/client";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { listTaskEvents } from "@/modules/review";
import { makeFixture, resetDb } from "../../helpers";

describe("看板状态移动", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  async function deliveryFor(taskId: string, summary: string): Promise<DeliveryInput> {
    let { requirements } = await getTaskDelivery(fx.student.id, taskId);
    if (!requirements.criteria.length) requirements = await saveTaskRequirements(fx.admin.id, taskId, {
      version: requirements.version,
      criteria: [{ id: randomUUID(), text: "关键场景验证通过" }],
    });
    return {
      requirementsVersion: requirements.version, summary, verification: "关键场景已核对",
      links: [{ title: "成果报告", url: "https://example.test/board-delivery" }], resourceIds: [],
      checks: requirements.criteria.map((criterion) => ({ criterionId: criterion.id, met: true })),
    };
  }

  async function reviewFor(taskId: string, passed = true, summary = "成果及验收项通过"): Promise<ReviewInput> {
    const { submissions } = await getTaskDelivery(fx.teacher.id, taskId);
    const current = submissions[0];
    return { submissionId: current.id, summary, checks: current.criteria.map((criterion) => ({ criterionId: criterion.id, passed, note: passed ? "已核对" : summary })) };
  }

  it("认领 → 结构化成果提交 → 绑定当前版本逐项验收", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "看板主链路",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    const submitted = await moveTask(fx.student.id, task.id, {
      status: "submitted",
      delivery: await deliveryFor(task.id, "成果已完成"),
    });
    expect(submitted.completionNote).toBe("成果已完成");
    expect(
      (await moveTask(fx.teacher.id, task.id, { status: "accepted", review: await reviewFor(task.id) })).status,
    ).toBe("accepted");
    expect(
      (await listTaskEvents(fx.admin.id, task.id)).map((event) => event.action),
    ).toEqual(["create", "claim", "update", "submit", "accept"]);
    const submission = (await getTaskDelivery(fx.admin.id, task.id)).submissions[0];
    expect(submission).toMatchObject({ version: 1, summary: "成果已完成", source: "structured", review: { action: "accept" } });
    expect(submission.links).toHaveLength(1);
  });
  it("缺少结构化成果或仅文字说明不能移动，保持原列和事件", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "需要说明",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    for (const patch of [{ status: "submitted" }, { status: "submitted", note: "只写了完成说明" }] as const) {
      await expect(moveTask(fx.student.id, task.id, patch)).rejects.toBeInstanceOf(AppError);
    }
    expect((await getTaskDetail(fx.student.id, task.id)).status).toBe(
      "in_progress",
    );
    expect((await listTaskEvents(fx.admin.id, task.id)).map((event) => event.action)).toEqual(["create", "claim"]);
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions).toEqual([]);
  });
  it("不能跨过待验收直接完成", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "非法路径",
    });
    await expect(
      moveTask(fx.admin.id, task.id, { status: "accepted" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("非成员不能移动", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "越权",
    });
    await expect(
      moveTask(fx.outsider.id, task.id, { status: "in_progress" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("学生不能通过看板验收", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "角色限制",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    await moveTask(fx.student.id, task.id, {
      status: "submitted",
      delivery: await deliveryFor(task.id, "完成"),
    });
    await expect(
      moveTask(fx.student.id, task.id, { status: "accepted", review: await reviewFor(task.id) }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("状态与属性组合不会丢弃一半修改", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "混合操作",
    });
    await expect(
      moveTask(fx.admin.id, task.id, {
        status: "in_progress",
        priority: "high",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await getTaskDetail(fx.admin.id, task.id)).toMatchObject({
      status: "unclaimed",
      priority: "medium",
    });
  });
  it("带修改意见打回并重新提交", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "看板反馈循环",
    });
    await moveTask(fx.student.id, task.id, { status: "in_progress" });
    await moveTask(fx.student.id, task.id, {
      status: "submitted",
      delivery: await deliveryFor(task.id, "初稿"),
    });
    expect(
      (
        await moveTask(fx.teacher.id, task.id, {
          status: "rejected",
          review: await reviewFor(task.id, false, "补验证"),
        })
      ).rejectReason,
    ).toBe("补验证");
    expect(
      (
        await moveTask(fx.student.id, task.id, {
          status: "submitted",
          delivery: await deliveryFor(task.id, "已补验证"),
        })
      ).status,
    ).toBe("submitted");
    const { submissions } = await getTaskDelivery(fx.admin.id, task.id);
    expect(submissions.map((submission) => submission.version)).toEqual([2, 1]);
    expect(submissions[1]).toMatchObject({ summary: "初稿", review: { action: "reject", summary: "补验证" } });
    expect(submissions[0]).toMatchObject({ summary: "已补验证", review: null });
  });

  it("缺成果证据或缺验收项不能生成提交版本", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "校验不可绕过", assigneeId: fx.student.id });
    const delivery = await deliveryFor(task.id, "已完成");
    for (const invalid of [{ ...delivery, links: [], resourceIds: [] }, { ...delivery, checks: [] }]) {
      await expect(moveTask(fx.student.id, task.id, { status: "submitted", delivery: invalid })).rejects.toBeInstanceOf(AppError);
    }
    expect((await getTaskDetail(fx.student.id, task.id)).status).toBe("in_progress");
    expect((await getTaskDelivery(fx.admin.id, task.id)).submissions).toEqual([]);
    expect((await listTaskEvents(fx.admin.id, task.id)).some((event) => event.action === "submit")).toBe(false);
  });

  it("纯文字验收和未逐项通过均保留待验收列", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "逐项确认", assigneeId: fx.student.id });
    await moveTask(fx.student.id, task.id, { status: "submitted", delivery: await deliveryFor(task.id, "已完成") });
    await expect(moveTask(fx.teacher.id, task.id, { status: "accepted", note: "已通过" })).rejects.toBeInstanceOf(AppError);
    await expect(moveTask(fx.teacher.id, task.id, { status: "accepted", review: await reviewFor(task.id, false) })).rejects.toBeInstanceOf(AppError);
    expect((await getTaskDetail(fx.teacher.id, task.id)).status).toBe("submitted");
    expect((await getTaskDelivery(fx.teacher.id, task.id)).submissions[0].review).toBeNull();
  });

  it("旧提交版本的验收不会覆盖新版本", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "过期验收", assigneeId: fx.student.id });
    await moveTask(fx.student.id, task.id, { status: "submitted", delivery: await deliveryFor(task.id, "v1") });
    const stale = await reviewFor(task.id);
    await moveTask(fx.teacher.id, task.id, { status: "rejected", review: await reviewFor(task.id, false, "补充边界验证") });
    await moveTask(fx.student.id, task.id, { status: "submitted", delivery: await deliveryFor(task.id, "v2") });
    await expect(moveTask(fx.teacher.id, task.id, { status: "accepted", review: stale })).rejects.toBeInstanceOf(ConflictError);
    expect((await getTaskDetail(fx.teacher.id, task.id)).status).toBe("submitted");
    const { submissions } = await getTaskDelivery(fx.teacher.id, task.id);
    expect(submissions[0]).toMatchObject({ version: 2, summary: "v2", review: null });
    expect(submissions[1].review?.action).toBe("reject");
  });
});

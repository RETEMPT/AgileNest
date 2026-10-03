import { describe, it, expect, beforeEach } from "vitest";
import {
  createSubtask,
  createTask,
  getTaskDetail,
  listProjectTasks,
  transitionTask,
  updateTask,
} from "@/modules/tasks";
import { ConflictError, ForbiddenError, AppError } from "@/modules/core/errors";
import { listPendingReview, listTaskEvents, listMyInProgress } from "@/modules/review";
import { addWorklog, completionRatio, projectCompletion, memberContribution } from "@/modules/worklog";
import { createMilestone, listMilestones } from "@/modules/milestone";
import { listMyNotifications } from "@/modules/notify";
import { makeFixture, resetDb } from "../../helpers";

describe("tasks 五态状态机（集成）", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;

  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  it("happy：认领 → 提交 → 验收通过", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, {
      title: "写开题报告",
      dueDate: "2026-10-01",
    });
    expect(t.status).toBe("unclaimed");

    const claimed = await transitionTask(fx.student.id, t.id, "claim");
    expect(claimed.status).toBe("in_progress");
    expect(claimed.assigneeId).toBe(fx.student.id);

    const submitted = await transitionTask(fx.student.id, t.id, "submit", {
      note: "已完成初稿",
    });
    expect(submitted.status).toBe("submitted");
    expect(submitted.completionNote).toBe("已完成初稿");

    const accepted = await transitionTask(fx.teacher.id, t.id, "accept");
    expect(accepted.status).toBe("accepted");

    const events = await listTaskEvents(fx.student.id, t.id);
    expect(events.map((e) => e.action)).toEqual(["create", "claim", "submit", "accept"]);
  });

  it("打回 → 重新提交", async () => {
    const t = await createTask(fx.teacher.id, fx.project.id, { title: "画看板" });
    await transitionTask(fx.student.id, t.id, "claim");
    await transitionTask(fx.student.id, t.id, "submit", { note: "v1" });
    const rejected = await transitionTask(fx.teacher.id, t.id, "reject", {
      note: "缺少泳道",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectReason).toBe("缺少泳道");

    const resub = await transitionTask(fx.student.id, t.id, "resubmit", {
      note: "v2 补泳道",
    });
    expect(resub.status).toBe("submitted");
  });

  it("非法转移抛 409", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, { title: "x" });
    await expect(transitionTask(fx.admin.id, t.id, "accept")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("submit 必须填说明", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, { title: "x" });
    await transitionTask(fx.student.id, t.id, "claim");
    await expect(transitionTask(fx.student.id, t.id, "submit")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("越权：学生不能验收；非成员不能读", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, { title: "x" });
    await transitionTask(fx.student.id, t.id, "claim");
    await transitionTask(fx.student.id, t.id, "submit", { note: "ok" });
    await expect(transitionTask(fx.student.id, t.id, "accept")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getTaskDetail(fx.outsider.id, t.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("子任务：创建与完成度", async () => {
    const parent = await createTask(fx.admin.id, fx.project.id, { title: "大任务" });
    await createSubtask(fx.admin.id, parent.id, { title: "子1" });
    const sub2 = await createSubtask(fx.admin.id, parent.id, { title: "子2" });
    await transitionTask(fx.student.id, sub2.id, "claim");
    await transitionTask(fx.student.id, sub2.id, "submit", { note: "done" });
    await transitionTask(fx.teacher.id, sub2.id, "accept");

    const ratio = await completionRatio(fx.admin.id, parent.id);
    expect(ratio.total).toBe(2);
    expect(ratio.done).toBe(1);
    expect(ratio.ratio).toBe(0.5);

    const detail = await getTaskDetail(fx.admin.id, parent.id);
    expect(detail.subtasks).toHaveLength(2);
  });

  it("工时与贡献", async () => {
    const t = await createTask(fx.admin.id, fx.project.id, { title: "x" });
    await transitionTask(fx.student.id, t.id, "claim");
    await addWorklog(fx.student.id, t.id, { workDate: "2026-09-24", minutes: 90 });
    const hours = await memberContribution(fx.admin.id, fx.project.id);
    const me = hours.find((h) => h.userId === fx.student.id);
    expect(me?.minutes).toBe(90);
  });

  it("里程碑 + 教师待验收队列 + 通知", async () => {
    const ms = await createMilestone(fx.teacher.id, fx.project.id, {
      title: "开题",
      kind: "open_topic",
      targetDate: "2026-10-10",
    });
    expect((await listMilestones(fx.student.id, fx.project.id))[0].id).toBe(ms.id);

    const t = await createTask(fx.teacher.id, fx.project.id, {
      title: "交材料",
      milestoneId: ms.id,
    });
    await transitionTask(fx.student.id, t.id, "claim");
    await transitionTask(fx.student.id, t.id, "submit", { note: "已上传" });

    const pending = await listPendingReview(fx.teacher.id, fx.project.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].submitterName).toBeTruthy();

    const mine = await listMyInProgress(fx.student.id);
    // after submit, no longer in_progress
    expect(mine).toHaveLength(0);

    const notes = await listMyNotifications(fx.teacher.id);
    expect(notes.some((n) => n.type === "task_submitted")).toBe(true);
  });

  it("updateTask 改截止日期", async () => {
    const t = await createTask(fx.student.id, fx.project.id, { title: "x" });
    const updated = await updateTask(fx.student.id, t.id, { dueDate: "2026-11-01" });
    expect(updated.dueDate).toBe("2026-11-01");
  });

  it("列表筛选", async () => {
    await createTask(fx.admin.id, fx.project.id, { title: "a", priority: "high" });
    const t2 = await createTask(fx.admin.id, fx.project.id, { title: "b" });
    await transitionTask(fx.student.id, t2.id, "claim");
    const inProgress = await listProjectTasks(fx.admin.id, fx.project.id, {
      status: ["in_progress"],
    });
    expect(inProgress).toHaveLength(1);
  });
});

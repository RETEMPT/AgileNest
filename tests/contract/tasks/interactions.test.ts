import { beforeEach, describe, expect, it } from "vitest";
import {
  availableTransitions,
  createTask,
  getTaskDetail,
  transitionTask,
} from "@/modules/tasks";
import { joinTeam } from "@/modules/identity";
import { listTaskEvents } from "@/modules/review";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("状态机交互与并发契约", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  it("教师可指派待认领及待修改任务", async () => {
    for (const status of ["unclaimed", "rejected"] as const) {
      expect(
        availableTransitions(
          { status, assigneeId: fx.student.id },
          "teacher",
          fx.teacher.id,
        ).map((rule) => rule.action),
      ).toContain("assign");
    }
  });
  it("其他学生不出现提交和退回操作，服务端也拒绝", async () => {
    await joinTeam(fx.outsider.id, fx.team.inviteCode);
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "个人任务",
    });
    const claimed = await transitionTask(fx.student.id, task.id, "claim");
    expect(availableTransitions(claimed, "student", fx.outsider.id)).toEqual(
      [],
    );
    await expect(
      transitionTask(fx.outsider.id, task.id, "submit", { note: "越权" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      transitionTask(fx.outsider.id, task.id, "unclaim"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("并发认领只有一人成功，事件与负责人一致", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "抢同一任务",
    });
    const results = await Promise.allSettled([
      transitionTask(fx.student.id, task.id, "claim"),
      transitionTask(fx.admin.id, task.id, "claim"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected")
      expect(rejected.reason).toBeInstanceOf(ConflictError);
    const detail = await getTaskDetail(fx.admin.id, task.id);
    const events = await listTaskEvents(fx.admin.id, task.id);
    const claims = events.filter((event) => event.action === "claim");
    expect(claims).toHaveLength(1);
    expect(claims[0].actorId).toBe(detail.assigneeId);
  });
  it("空白完成说明不能提交，不产生事件", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "必须有成果说明",
    });
    await transitionTask(fx.student.id, task.id, "claim");
    await expect(
      transitionTask(fx.student.id, task.id, "submit", { note: "  " }),
    ).rejects.toBeInstanceOf(AppError);
    expect((await getTaskDetail(fx.admin.id, task.id)).status).toBe(
      "in_progress",
    );
    expect(
      (await listTaskEvents(fx.admin.id, task.id)).map((event) => event.action),
    ).toEqual(["create", "claim"]);
  });
  it("指派对象必须来自团队", async () => {
    const task = await createTask(fx.teacher.id, fx.project.id, {
      title: "指派",
    });
    await expect(
      transitionTask(fx.teacher.id, task.id, "assign", {
        assigneeId: fx.outsider.id,
      }),
    ).rejects.toThrow("指派对象不在团队中");
  });
  it("学生不能通过创建接口指派其他人，教师不能成为执行负责人", async () => {
    await expect(
      createTask(fx.student.id, fx.project.id, {
        title: "越权创建",
        assigneeId: fx.admin.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const task = await createTask(fx.teacher.id, fx.project.id, {
      title: "角色分工",
    });
    await expect(
      transitionTask(fx.teacher.id, task.id, "assign", {
        assigneeId: fx.teacher.id,
      }),
    ).rejects.toThrow("请选择学生或管理员作为任务负责人");
  });
  it("打回意见必填，重交后可验收与重新打开", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "修改循环",
    });
    await transitionTask(fx.student.id, task.id, "claim");
    await transitionTask(fx.student.id, task.id, "submit", { note: "初稿" });
    await expect(
      transitionTask(fx.teacher.id, task.id, "reject", { note: " " }),
    ).rejects.toBeInstanceOf(AppError);
    await transitionTask(fx.teacher.id, task.id, "reject", {
      note: "补上测试结果",
    });
    await transitionTask(fx.student.id, task.id, "resubmit", {
      note: "已补测试结果",
    });
    await transitionTask(fx.teacher.id, task.id, "accept");
    expect(
      (await transitionTask(fx.teacher.id, task.id, "reopen")).status,
    ).toBe("in_progress");
  });
});

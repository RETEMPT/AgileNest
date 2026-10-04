import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import {
  getWorkbench,
  listMyInProgress,
  listMyTodo,
  listPendingReview,
} from "@/modules/review";
import { createTask, transitionTask } from "@/modules/tasks";
import {
  updateMemberPositions,
  updateProject,
  createTeam,
  createProject,
  joinTeam,
} from "@/modules/identity";
import { ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("统一工作台", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("成员 PR #5 的混合团队身份回归：只验收自己有职务的项目", async () => {
    const otherTeam = await createTeam(fx.outsider.id, "另一个课题组");
    await joinTeam(fx.teacher.id, otherTeam.inviteCode);
    const otherProject = await createProject(fx.outsider.id, otherTeam.id, {
      name: "只参与执行的课题",
    });
    const other = await createTask(fx.teacher.id, otherProject.id, {
      title: "队员交付",
      assigneeId: fx.teacher.id,
    });
    await transitionTask(fx.teacher.id, other.id, "submit", { note: "完成" });
    const supervised = await createTask(fx.student.id, fx.project.id, {
      title: "指导交付",
      assigneeId: fx.student.id,
    });
    await transitionTask(fx.student.id, supervised.id, "submit", {
      note: "完成",
    });
    const work = await getWorkbench(fx.teacher.id);
    expect(work.review.map((task) => task.id)).toEqual([supervised.id]);
    expect(work.mine.map((task) => task.id)).toEqual([other.id]);
  });
  it("本人待办包含当前权限和项目名称", async () => {
    await createTask(fx.student.id, fx.project.id, {
      title: "执行",
      assigneeId: fx.student.id,
    });
    const work = await getWorkbench(fx.student.id);
    expect(work.mine).toHaveLength(1);
    expect(work.mine[0].projectName).toBe(fx.project.name);
    expect(work.mine[0].permissions.actions).toContain("submit");
  });
  it("非成员无法从跨项目工作台看任务", async () => {
    await createTask(fx.admin.id, fx.project.id, { title: "私有任务" });
    expect(await getWorkbench(fx.outsider.id)).toEqual({
      mine: [],
      review: [],
      pool: [],
    });
  });
  it("纯指导老师没有可认领队列", async () => {
    await createTask(fx.admin.id, fx.project.id, { title: "待分工" });
    expect(await listMyTodo(fx.teacher.id)).toHaveLength(0);
    expect(await listMyTodo(fx.student.id)).toHaveLength(1);
  });
  it("叠加职务同时显示执行与验收事项", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, [
      "advisor",
      "member",
    ]);
    await createTask(fx.teacher.id, fx.project.id, {
      title: "我的任务",
      assigneeId: fx.teacher.id,
    });
    const task = await createTask(fx.student.id, fx.project.id, {
      title: "待审",
      assigneeId: fx.student.id,
    });
    await transitionTask(fx.student.id, task.id, "submit", { note: "完成" });
    const work = await getWorkbench(fx.teacher.id);
    expect(work.mine).toHaveLength(1);
    expect(work.review).toHaveLength(1);
    expect(work.review[0].permissions.actions).toContain("accept");
  });
  it("退出团队后即使仍被记录为负责人也不再显示", async () => {
    await createTask(fx.student.id, fx.project.id, {
      title: "旧任务",
      assigneeId: fx.student.id,
    });
    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, fx.team.id),
          eq(teamMembers.userId, fx.student.id),
        ),
      );
    expect(await listMyInProgress(fx.student.id)).toHaveLength(0);
  });
  it("归档项目不混入当前工作队列，普通队员不能验收", async () => {
    await createTask(fx.student.id, fx.project.id, {
      title: "旧项目任务",
      assigneeId: fx.student.id,
    });
    await updateProject(fx.admin.id, fx.project.id, { status: "archived" });
    expect((await getWorkbench(fx.student.id)).mine).toHaveLength(0);
    await expect(
      listPendingReview(fx.student.id, fx.project.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

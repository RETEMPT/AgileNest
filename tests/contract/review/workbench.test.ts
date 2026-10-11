import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import {
  getWorkbench,
  listMyInProgress,
  listMyTodo,
  listPendingReview,
  listTaskEvents,
} from "@/modules/review";
import { availableTransitions, changeTaskOrganization, createSubtask, createTask, getTaskDelivery, getTaskOrganization } from "@/modules/tasks";
import {
  updateMemberPositions,
  updateProject,
  createTeam,
  createProject,
  joinTeam,
} from "@/modules/identity";
import { ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";
import { reviewEvidence, submitEvidence } from "../../delivery-fixtures";

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
    await submitEvidence(fx.teacher.id, other.id, "完成");
    const supervised = await createTask(fx.student.id, fx.project.id, {
      title: "指导交付",
      assigneeId: fx.student.id,
    });
    await submitEvidence(fx.student.id, supervised.id, "完成");
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
  it("工作台透传前置依赖守卫，完成前置任务后恢复提交入口", async () => {
    const blocker = await createTask(fx.admin.id, fx.project.id, { title: "准备研究材料", assigneeId: fx.student.id });
    const task = await createTask(fx.admin.id, fx.project.id, { title: "整理研究结论", assigneeId: fx.student.id });
    const organization = await getTaskOrganization(fx.admin.id, task.id);
    await changeTaskOrganization(fx.admin.id, task.id, { op: "addDependency", version: organization.version, direction: "blockedBy", otherTaskId: blocker.id });
    const blocked = (await getWorkbench(fx.student.id)).mine.find((item) => item.id === task.id)!;
    expect(blocked).toMatchObject({ blocked: true, blockedByIds: [blocker.id] });
    expect(availableTransitions(blocked, "student", fx.student.id).map((rule) => rule.action)).not.toContain("submit");
    await submitEvidence(fx.student.id, blocker.id, "材料已整理");
    await reviewEvidence(fx.teacher.id, blocker.id, "accept", "材料齐全");
    const ready = (await getWorkbench(fx.student.id)).mine.find((item) => item.id === task.id)!;
    expect(ready.blocked).toBe(false);
    expect(availableTransitions(ready, "student", fx.student.id).map((rule) => rule.action)).toContain("submit");
  });
  it("工作台与验收台复用子任务验收守卫，仍保留打回处理入口", async () => {
    const parent = await createTask(fx.admin.id, fx.project.id, { title: "汇总项目材料", assigneeId: fx.student.id });
    const child = await createSubtask(fx.admin.id, parent.id, { title: "核对附录", assigneeId: fx.student.id });
    await submitEvidence(fx.student.id, parent.id, "汇总已提交");
    const queue = (await listPendingReview(fx.teacher.id, fx.project.id)).find((task) => task.id === parent.id)!;
    const work = (await getWorkbench(fx.teacher.id)).review.find((task) => task.id === parent.id)!;
    for (const item of [queue, work]) {
      expect(item.acceptBlocked).toBe(true);
      expect(availableTransitions(item, "teacher", fx.teacher.id).map((rule) => rule.action)).toEqual(["reject"]);
    }
    await submitEvidence(fx.student.id, child.id, "附录已核对");
    await reviewEvidence(fx.teacher.id, child.id, "accept", "附录完整");
    const ready = (await listPendingReview(fx.teacher.id, fx.project.id)).find((task) => task.id === parent.id)!;
    expect(ready.acceptBlocked).toBe(false);
    expect(availableTransitions(ready, "teacher", fx.teacher.id).map((rule) => rule.action)).toEqual(["accept", "reject"]);
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
    await submitEvidence(fx.student.id, task.id, "完成");
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
  it("修改后重交保留最新成果、上次修改意见和完整流转历史", async () => {
    const task = await createTask(fx.student.id, fx.project.id, {
      title: "检查交付上下文",
      assigneeId: fx.student.id,
    });
    await submitEvidence(fx.student.id, task.id, "第一版成果");
    await reviewEvidence(fx.teacher.id, task.id, "reject", "补充边界验证");
    const firstVersion = (await getTaskDelivery(fx.teacher.id, task.id)).submissions[0];
    const rejected = (await getWorkbench(fx.student.id)).mine.find((item) => item.id === task.id);
    expect(rejected).toMatchObject({ status: "rejected", completionNote: "第一版成果", rejectReason: "补充边界验证" });
    await submitEvidence(fx.student.id, task.id, "已补齐边界验证", "resubmit");
    const [pending] = await listPendingReview(fx.teacher.id, fx.project.id);
    expect(pending).toMatchObject({ completionNote: "已补齐边界验证", rejectReason: "补充边界验证" });
    expect(pending.permissions?.actions).toContain("accept");
    const { submissions } = await getTaskDelivery(fx.teacher.id, task.id);
    expect(submissions.map((submission) => submission.version)).toEqual([2, 1]);
    expect(submissions[1]).toEqual(firstVersion);
    expect((await listTaskEvents(fx.teacher.id, task.id)).filter((event) => ["submit", "reject", "resubmit"].includes(event.action)).map((event) => event.action)).toEqual(["submit", "reject", "resubmit"]);
    await reviewEvidence(fx.teacher.id, task.id);
    expect(await listPendingReview(fx.teacher.id, fx.project.id)).toHaveLength(0);
    expect((await getWorkbench(fx.teacher.id)).review).toHaveLength(0);
  });
});

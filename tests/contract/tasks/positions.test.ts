import { beforeEach, describe, expect, it } from "vitest";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { createProject, updateMemberPositions } from "@/modules/identity";
import {
  createTask,
  getTaskDetail,
  transitionTask,
  availableTransitions,
} from "@/modules/tasks";
import { makeFixture, resetDb } from "../../helpers";

describe("职务权限与状态机交互同源", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("实验室队长可以指派，但不能验收", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "leader",
      "member",
    ]);
    const lab = await createProject(fx.admin.id, fx.team.id, {
      name: "课题",
      kind: "lab",
    });
    const task = await createTask(fx.admin.id, lab.id, { title: "论文实验" });
    const detail = await getTaskDetail(fx.student.id, task.id);
    expect(
      availableTransitions(detail, "student", fx.student.id).map(
        (rule) => rule.action,
      ),
    ).toContain("assign");
    await transitionTask(fx.student.id, task.id, "assign", {
      assigneeId: fx.admin.id,
    });
    await transitionTask(fx.admin.id, task.id, "submit", { note: "成果" });
    await expect(
      transitionTask(fx.student.id, task.id, "accept"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      availableTransitions(
        await getTaskDetail(fx.student.id, task.id),
        "student",
        fx.student.id,
      ),
    ).toHaveLength(0);
  });
  it("课程队长没有指派权限", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "leader",
    ]);
    const course = await createProject(fx.admin.id, fx.team.id, {
      name: "课程",
      kind: "course",
    });
    const task = await createTask(fx.admin.id, course.id, { title: "作业" });
    await expect(
      transitionTask(fx.student.id, task.id, "assign", {
        assigneeId: fx.admin.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      availableTransitions(
        await getTaskDetail(fx.student.id, task.id),
        "student",
        fx.student.id,
      ).map((rule) => rule.action),
    ).not.toContain("assign");
  });
  it("指导老师叠加队员可认领并提交自己任务", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, [
      "advisor",
      "member",
    ]);
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "联合研究",
    });
    await transitionTask(fx.teacher.id, task.id, "claim");
    expect(
      availableTransitions(
        await getTaskDetail(fx.teacher.id, task.id),
        "teacher",
        fx.teacher.id,
      ).map((rule) => rule.action),
    ).toContain("submit");
    await transitionTask(fx.teacher.id, task.id, "submit", {
      note: "完成验证",
    });
    await transitionTask(fx.admin.id, task.id, "accept");
  });
  it("叠加指导老师与队员不能代提交他人任务", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, [
      "advisor",
      "member",
    ]);
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "成员作业",
      assigneeId: fx.student.id,
    });
    await expect(
      transitionTask(fx.teacher.id, task.id, "submit", { note: "越权" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      availableTransitions(
        await getTaskDetail(fx.teacher.id, task.id),
        "teacher",
        fx.teacher.id,
      ).map((rule) => rule.action),
    ).not.toContain("submit");
  });
  it("可指派叠加队员的老师，纯指导老师不作为负责人", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "负责人选择",
    });
    await expect(
      transitionTask(fx.admin.id, task.id, "assign", {
        assigneeId: fx.teacher.id,
      }),
    ).rejects.toBeInstanceOf(AppError);
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, [
      "advisor",
      "member",
    ]);
    expect(
      await transitionTask(fx.admin.id, task.id, "assign", {
        assigneeId: fx.teacher.id,
      }),
    ).toMatchObject({ assigneeId: fx.teacher.id });
  });
  it("撤销职务后服务端不信任旧页面权限", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "leader",
    ]);
    const lab = await createProject(fx.admin.id, fx.team.id, {
      name: "实验",
      kind: "lab",
    });
    const task = await createTask(fx.admin.id, lab.id, { title: "指派" });
    const old = await getTaskDetail(fx.student.id, task.id);
    expect(old.permissions?.actions).toContain("assign");
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "member",
    ]);
    await expect(
      transitionTask(fx.student.id, task.id, "assign", {
        assigneeId: fx.admin.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("有权限仍必须遵循五态转移", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, [
      "advisor",
      "member",
    ]);
    const task = await createTask(fx.admin.id, fx.project.id, {
      title: "非法跳转",
    });
    await expect(
      transitionTask(fx.teacher.id, task.id, "accept"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

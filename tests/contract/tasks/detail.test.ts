import { describe, it, expect, beforeEach } from "vitest";
import {
  createTeam,
  joinTeam,
  updateMemberRole,
  createProject,
} from "@/modules/identity";
import {
  createSubtask,
  createTask,
  getTaskDetail,
  listSubtasks,
  setDueDate,
} from "@/modules/tasks";
import { resetDb, makeUser } from "../../helpers";

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "甲组");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, { name: "课程项目" });
  return { owner, student, teacher, team, project };
}

describe("任务详情 / 子任务", () => {
  beforeEach(resetDb);

  it("getTaskDetail 返回任务及其子任务", async () => {
    const { owner, project } = await scene();
    const parent = await createTask(owner.id, project.id, { title: "父任务" });
    const child = await createSubtask(owner.id, parent.id, { title: "子任务" });

    const detail = await getTaskDetail(owner.id, parent.id);
    expect(detail.title).toBe("父任务");
    expect(detail.subtasks).toHaveLength(1);
    expect(detail.subtasks[0].id).toBe(child.id);
    expect(detail.subtasks[0].parentTaskId).toBe(parent.id);
  });

  it("createSubtask 挂在父任务下且同项目", async () => {
    const { owner, project } = await scene();
    const parent = await createTask(owner.id, project.id, { title: "父任务" });
    const child = await createSubtask(owner.id, parent.id, {
      title: "子任务",
      dueDate: "2026-12-01",
    });

    expect(child.parentTaskId).toBe(parent.id);
    expect(child.projectId).toBe(parent.projectId);
    expect(child.dueDate).toBe("2026-12-01");
    expect(child.status).toBe("unclaimed");
  });

  it("listSubtasks 只返回子任务", async () => {
    const { owner, project } = await scene();
    const parent = await createTask(owner.id, project.id, { title: "父任务" });
    const other = await createTask(owner.id, project.id, { title: "兄弟任务" });
    await createSubtask(owner.id, parent.id, { title: "子任务" });

    const subs = await listSubtasks(owner.id, parent.id);
    expect(subs.map((s) => s.title)).toEqual(["子任务"]);
    expect(subs.some((s) => s.id === other.id)).toBe(false);
  });

  it("setDueDate 改截止日期；teacher 无权", async () => {
    const { owner, student, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });

    const updated = await setDueDate(student.id, task.id, "2026-11-30");
    expect(updated.dueDate).toBe("2026-11-30");

    await expect(setDueDate(teacher.id, task.id, "2026-12-01")).rejects.toThrow(
      "没有权限",
    );
  });

  it("非成员 getTaskDetail 越权", async () => {
    const { owner, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    const outsider = await makeUser("outsider@example.com");
    await expect(getTaskDetail(outsider.id, task.id)).rejects.toThrow();
  });

  it("父任务不存在时 createSubtask 抛 NotFound", async () => {
    const { owner } = await scene();
    await expect(
      createSubtask(owner.id, "00000000-0000-0000-0000-000000000000", { title: "孤儿" }),
    ).rejects.toThrow("父任务");
  });

  it("非成员 createSubtask 越权", async () => {
    const { owner, project } = await scene();
    const parent = await createTask(owner.id, project.id, { title: "父任务" });
    const outsider = await makeUser("outsider@example.com");
    await expect(
      createSubtask(outsider.id, parent.id, { title: "越权子任务" }),
    ).rejects.toThrow();
  });
});

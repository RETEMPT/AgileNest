import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks as tasksTable } from "@/db/schema";
import {
  createTeam,
  joinTeam,
  updateMemberRole,
  createProject,
} from "@/modules/identity";
import {
  createTask,
  deleteTask,
  listProjectTasks,
  transitionTask,
  updateTask,
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

describe("transitionTask 状态机", () => {
  beforeEach(resetDb);

  it("claim → submit → accept 全流程", async () => {
    const { owner, student, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "实现登录" });
    expect(task.status).toBe("unclaimed");

    const claimed = await transitionTask(student.id, task.id, "claim");
    expect(claimed.status).toBe("in_progress");
    expect(claimed.assigneeId).toBe(student.id);

    const submitted = await transitionTask(student.id, task.id, "submit", {
      note: "已完成",
    });
    expect(submitted.status).toBe("submitted");
    expect(submitted.completionNote).toBe("已完成");

    const accepted = await transitionTask(teacher.id, task.id, "accept");
    expect(accepted.status).toBe("accepted");

    // acceptedById 不在 DTO 中，直接查库确认验收人已落库
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, task.id));
    expect(row.acceptedById).toBe(teacher.id);
  });

  it("student 验收被拒（仅 teacher/admin）", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    await transitionTask(student.id, task.id, "claim");
    await transitionTask(student.id, task.id, "submit", { note: "完成" });
    await expect(transitionTask(student.id, task.id, "accept")).rejects.toThrow(
      "没有权限",
    );
  });

  it("对进行中的任务再次 claim 冲突", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    await transitionTask(student.id, task.id, "claim");
    await expect(transitionTask(student.id, task.id, "claim")).rejects.toThrow(
      "不允许",
    );
  });

  it("提交缺少说明被拒", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    await transitionTask(student.id, task.id, "claim");
    await expect(transitionTask(student.id, task.id, "submit")).rejects.toThrow(
      "说明",
    );
  });

  it("非负责人提交被拒（selfOnly）", async () => {
    const { owner, student, team, project } = await scene();
    const other = await makeUser("other@example.com");
    await joinTeam(other.id, team.inviteCode);

    const task = await createTask(owner.id, project.id, { title: "任务" });
    await transitionTask(student.id, task.id, "claim");
    await expect(
      transitionTask(other.id, task.id, "submit", { note: "冒充" }),
    ).rejects.toThrow("负责人");
  });

  it("打回后重新提交清空打回原因", async () => {
    const { owner, student, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    await transitionTask(student.id, task.id, "claim");
    await transitionTask(student.id, task.id, "submit", { note: "初版" });

    const rejected = await transitionTask(teacher.id, task.id, "reject", {
      note: "有 bug",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectReason).toBe("有 bug");

    const resubmitted = await transitionTask(student.id, task.id, "resubmit", {
      note: "已修复",
    });
    expect(resubmitted.status).toBe("submitted");
    expect(resubmitted.rejectReason).toBeNull();
  });
});

describe("updateTask / deleteTask", () => {
  beforeEach(resetDb);

  it("updateTask 只改字段不改状态", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "旧名" });
    const updated = await updateTask(student.id, task.id, {
      title: "新名",
      priority: "high",
      sortOrder: 3,
    });
    expect(updated.title).toBe("新名");
    expect(updated.priority).toBe("high");
    expect(updated.sortOrder).toBe(3);
    expect(updated.status).toBe("unclaimed");
  });

  it("teacher 可删除，student 不可", async () => {
    const { owner, student, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "删我" });

    await expect(deleteTask(student.id, task.id)).rejects.toThrow("没有权限");
    await deleteTask(teacher.id, task.id);

    const list = await listProjectTasks(owner.id, project.id);
    expect(list).toHaveLength(0);
  });
});

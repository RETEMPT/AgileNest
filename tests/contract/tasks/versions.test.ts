import { beforeEach, describe, expect, it } from "vitest";
import { createTask, createTaskVersion, listTaskVersions } from "@/modules/tasks";
import { AppError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);

describe("任务版本历史", () => {
  async function fixture() {
    const f = await makeFixture();
    const task = await createTask(f.student.id, f.project.id, {
      title: "版本任务",
      description: "初始说明",
      assigneeId: f.student.id,
    });
    return { ...f, task };
  }

  it("成员可记录版本并自动递增，外部账号被拒绝", async () => {
    const f = await fixture();
    await expect(listTaskVersions(f.outsider.id, f.task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTaskVersion(f.outsider.id, f.task.id, { content: "越权" })).rejects.toBeInstanceOf(ForbiddenError);

    const first = await createTaskVersion(f.student.id, f.task.id, { content: "第一版" });
    expect(first.version).toMatchObject({ version: 1, content: "第一版" });

    const second = await createTaskVersion(f.teacher.id, f.task.id, { content: "第二版", remark: "评审后定稿" });
    expect(second.version).toMatchObject({ version: 2, remark: "评审后定稿" });

    const list = await listTaskVersions(f.student.id, f.task.id);
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ content: "第二版", authorName: "teacher" });
    expect(list[1]).toMatchObject({ content: "第一版", authorName: "student" });
  });

  it("拒绝空内容、超长备注与不存在的任务", async () => {
    const f = await fixture();
    await expect(createTaskVersion(f.student.id, f.task.id, { content: "   " })).rejects.toBeInstanceOf(AppError);
    await expect(createTaskVersion(f.student.id, f.task.id, { content: "x", remark: "a".repeat(501) })).rejects.toBeInstanceOf(AppError);
    await expect(listTaskVersions(f.student.id, crypto.randomUUID())).rejects.toBeInstanceOf(AppError);
  });
});

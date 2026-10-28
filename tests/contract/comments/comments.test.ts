import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { createProject } from "@/modules/identity";
import { createProjectComment, listProjectComments, updateProjectComment, withdrawProjectComment } from "@/modules/comments";
import { projectCommentCreateSchema, projectCommentEditSchema, projectCommentListSchema, projectCommentSchema, projectCommentWithdrawSchema } from "@/modules/comments/client";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);

describe("项目评论公开边界", () => {
  it("正文去除首尾空白，容量与版本约束生效", () => {
    expect(projectCommentCreateSchema.parse({ body: " 内容 " })).toEqual({ body: "内容" });
    expect(projectCommentCreateSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(projectCommentCreateSchema.safeParse({ body: "文".repeat(10001) }).success).toBe(false);
    expect(projectCommentEditSchema.safeParse({ version: 0, body: "x" }).success).toBe(false);
    expect(projectCommentWithdrawSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(projectCommentSchema.safeParse({ id: crypto.randomUUID(), body: "不完整" }).success).toBe(false);
    expect(projectCommentListSchema.parse({ comments: [] }).comments).toEqual([]);
  });
});

describe("项目评论", () => {
  it("师生都可评论，外部账号读写均被拒绝", async () => {
    const f = await makeFixture();
    const student = await createProjectComment(f.student.id, f.project.id, { body: "学生评论" });
    const teacher = await createProjectComment(f.teacher.id, f.project.id, { body: "教师评论" });
    const listed = await listProjectComments(f.admin.id, f.project.id);
    expect(listed.comments.map((c) => c.id)).toContain(student.id);
    expect(listed.comments.map((c) => c.id)).toContain(teacher.id);
    expect(listed.comments.find((c) => c.id === student.id)?.authorName).toBe(f.student.name);
    await expect(listProjectComments(f.outsider.id, f.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createProjectComment(f.outsider.id, f.project.id, { body: "越权" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("一层回复绑定本项目，不能回复子回复或其他项目", async () => {
    const f = await makeFixture();
    const root = await createProjectComment(f.student.id, f.project.id, { body: "需要确认" });
    const reply = await createProjectComment(f.teacher.id, f.project.id, { body: "已说明", parentId: root.id });
    expect(reply.parentId).toBe(root.id);
    await expect(createProjectComment(f.student.id, f.project.id, { body: "二层", parentId: reply.id })).rejects.toBeInstanceOf(ConflictError);
    const otherProject = await createProject(f.admin.id, f.team.id, { name: "另一项目" });
    await expect(createProjectComment(f.student.id, otherProject.id, { body: "错绑", parentId: root.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProjectComment(f.student.id, otherProject.id, root.id, { version: 1, body: "错改" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("作者编辑保留版本，旧版本和他人编辑被拒绝", async () => {
    const f = await makeFixture();
    const comment = await createProjectComment(f.student.id, f.project.id, { body: "第一版" });
    const updated = await updateProjectComment(f.student.id, f.project.id, comment.id, { version: 1, body: "第二版" });
    expect(updated.version).toBe(2);
    expect(updated.body).toBe("第二版");
    await expect(updateProjectComment(f.student.id, f.project.id, comment.id, { version: 1, body: "旧版覆盖" })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateProjectComment(f.teacher.id, f.project.id, comment.id, { version: 2, body: "他人替写" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("作者或管理员可撤回，普通成员无权限，撤回后不能回复", async () => {
    const f = await makeFixture();
    const comment = await createProjectComment(f.student.id, f.project.id, { body: "保留审计" });
    await expect(withdrawProjectComment(f.teacher.id, f.project.id, comment.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    const withdrawn = await withdrawProjectComment(f.admin.id, f.project.id, comment.id, 1);
    expect(withdrawn).toMatchObject({ withdrawn: true, body: "", canEdit: false, canWithdraw: false });
    await expect(createProjectComment(f.teacher.id, f.project.id, { body: "回复已撤回", parentId: comment.id })).rejects.toBeInstanceOf(ConflictError);
  });
});

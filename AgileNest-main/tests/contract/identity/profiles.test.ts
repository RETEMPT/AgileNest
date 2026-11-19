import { beforeEach, describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  getProjectForUser,
} from "@/modules/core";
import {
  createProject,
  createTeam,
  joinTeam,
  listTeamMembers,
  saveAcademicProfile,
  getAcademicProfile,
  confirmAcademicIdentity,
  updateMemberPositions,
  updateProject,
} from "@/modules/identity";
import { makeFixture, resetDb } from "../../helpers";

describe("学术身份与团队职务", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("四种身份可自行填写，资料有长度限制", async () => {
    for (const identity of [
      "undergraduate",
      "master",
      "doctoral",
      "teacher",
    ] as const) {
      await saveAcademicProfile(fx.student.id, {
        identity,
        institution: "  示例大学  ",
      });
      expect(await getAcademicProfile(fx.student.id)).toMatchObject({
        identity,
        institution: "示例大学",
      });
    }
    await expect(
      saveAcademicProfile(fx.student.id, {
        identity: "master",
        institution: "长".repeat(101),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
  it("填写老师身份不会获得验收或管理权限", async () => {
    await saveAcademicProfile(fx.student.id, { identity: "teacher" });
    const access = await getProjectForUser(fx.student.id, fx.project.id);
    expect(access?.role).toBe("student");
    expect(access?.capabilities.review).toBe(false);
  });
  it("管理员确认当前版本，同样资料再次保存保留确认", async () => {
    const profile = await saveAcademicProfile(fx.student.id, {
      identity: "master",
    });
    await confirmAcademicIdentity(
      fx.admin.id,
      fx.team.id,
      fx.student.id,
      profile!.version,
    );
    await saveAcademicProfile(fx.student.id, { identity: "master" });
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (member) => member.id === fx.student.id,
      )?.identityConfirmed,
    ).toBe(true);
  });
  it("更新资料使旧确认失效，过期版本不能确认", async () => {
    const profile = await saveAcademicProfile(fx.student.id, {
      identity: "master",
    });
    await confirmAcademicIdentity(
      fx.admin.id,
      fx.team.id,
      fx.student.id,
      profile!.version,
    );
    await saveAcademicProfile(fx.student.id, { identity: "doctoral" });
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (member) => member.id === fx.student.id,
      )?.identityConfirmed,
    ).toBe(false);
    await expect(
      confirmAcademicIdentity(
        fx.admin.id,
        fx.team.id,
        fx.student.id,
        profile!.version,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("确认按团队隔离", async () => {
    const second = await createTeam(fx.admin.id, "第二实验室");
    await joinTeam(fx.student.id, second.inviteCode);
    const profile = await saveAcademicProfile(fx.student.id, {
      identity: "doctoral",
    });
    await confirmAcademicIdentity(
      fx.admin.id,
      fx.team.id,
      fx.student.id,
      profile!.version,
    );
    expect(
      (await listTeamMembers(fx.admin.id, second.id)).find(
        (member) => member.id === fx.student.id,
      )?.identityConfirmed,
    ).toBe(false);
  });
  it("非管理员、外人不能确认，管理员不能自行确认", async () => {
    const profile = await saveAcademicProfile(fx.admin.id, {
      identity: "teacher",
    });
    await expect(
      confirmAcademicIdentity(
        fx.admin.id,
        fx.team.id,
        fx.admin.id,
        profile!.version,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      confirmAcademicIdentity(
        fx.teacher.id,
        fx.team.id,
        fx.admin.id,
        profile!.version,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      confirmAcademicIdentity(
        fx.outsider.id,
        fx.team.id,
        fx.admin.id,
        profile!.version,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("目标必须在团队中且已填写身份", async () => {
    await expect(
      confirmAcademicIdentity(fx.admin.id, fx.team.id, fx.outsider.id, 1),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      confirmAcademicIdentity(fx.admin.id, fx.team.id, fx.student.id, 1),
    ).rejects.toBeInstanceOf(AppError);
  });
  it("管理员可授予叠加职务并保持旧角色兼容", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "advisor",
      "member",
    ]);
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (member) => member.id === fx.student.id,
      ),
    ).toMatchObject({
      positions: ["advisor", "member"],
      role: "teacher",
      canExecute: true,
    });
  });
  it("成员不能自升职、越团队赋职，也不能清空最后管理员职务", async () => {
    await expect(
      updateMemberPositions(fx.student.id, fx.team.id, fx.student.id, [
        "admin",
      ]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateMemberPositions(fx.admin.id, fx.team.id, fx.outsider.id, [
        "member",
      ]),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateMemberPositions(fx.admin.id, fx.team.id, fx.admin.id, ["leader"]),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, []),
    ).rejects.toBeInstanceOf(AppError);
  });
  it("项目修改校验有效日期与既有日期的先后，失败保留原项目", async () => {
    await updateProject(fx.admin.id, fx.project.id, {
      startDate: "2026-10-03",
      endDate: "2026-12-31",
    });
    await expect(
      updateProject(fx.admin.id, fx.project.id, { endDate: "2026-02-30" }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateProject(fx.admin.id, fx.project.id, { endDate: "2026-10-01" }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateProject(fx.admin.id, fx.project.id, { name: " " }),
    ).rejects.toBeInstanceOf(AppError);
    expect(
      (await getProjectForUser(fx.admin.id, fx.project.id))?.project.endDate,
    ).toBe("2026-12-31");
  });
  it("队长仅创建管理实验室和竞赛项目，不能改成课程", async () => {
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, [
      "leader",
    ]);
    const lab = await createProject(fx.student.id, fx.team.id, {
      name: "课题",
      kind: "lab",
    });
    await updateProject(fx.student.id, lab.id, { name: "新课题" });
    await createProject(fx.student.id, fx.team.id, {
      name: "竞赛",
      kind: "contest",
    });
    await expect(
      createProject(fx.student.id, fx.team.id, {
        name: "课程",
        kind: "course",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateProject(fx.student.id, lab.id, { kind: "course" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateProject(fx.student.id, fx.project.id, { name: "无权修改" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

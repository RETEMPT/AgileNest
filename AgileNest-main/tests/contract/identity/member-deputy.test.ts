import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, getProjectForUser } from "@/modules/core";
import { createProject, createTeamAnnouncement, getTeamInformation, leaveTeam, listTeamMembers, mutateProjectDirectory, removeTeamMember, rotateTeamInvite, saveAcademicProfile, confirmAcademicIdentity, updateMemberPositions, updateProject, updateTeamInformation } from "@/modules/identity";
import { makeFixture, resetDb } from "../../helpers";

describe("副管理员、权限交接与版本保护", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });
  async function assignDeputy() { return updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["deputy", "member"]); }
  it("授予副管理员后真实成员和项目能力一致，兼容角色仍非管理员", async () => {
    await assignDeputy();
    expect((await listTeamMembers(fx.admin.id, fx.team.id)).find((member) => member.id === fx.student.id)).toMatchObject({ positions: ["deputy", "member"], role: "teacher", canExecute: true });
    expect((await getProjectForUser(fx.student.id, fx.project.id))?.capabilities).toMatchObject({ manageMembers: false, manageProject: true, review: true });
  });
  it("副管理员维护团队资料、公告、邀请码和项目目录", async () => {
    await assignDeputy();
    await updateTeamInformation(fx.student.id, fx.team.id, { version: 1, name: "协作组", description: "副管理员维护" });
    expect((await getTeamInformation(fx.teacher.id, fx.team.id)).name).toBe("协作组");
    await expect(createTeamAnnouncement(fx.student.id, fx.team.id, { title: "每日协作", body: "共享任务安排" })).resolves.toMatchObject({ authorId: fx.student.id });
    await expect(rotateTeamInvite(fx.student.id, fx.team.id, { version: 2 })).resolves.toMatchObject({ version: 3 });
    await expect(mutateProjectDirectory(fx.student.id, fx.team.id, { op: "create", name: "日常课题", parentId: null })).resolves.toBeUndefined();
  });
  it("副管理员可创建和维护课程项目", async () => {
    await assignDeputy();
    const project = await createProject(fx.student.id, fx.team.id, { name: "课程项目", kind: "course" });
    await expect(updateProject(fx.student.id, project.id, { name: "课程协作" })).resolves.toMatchObject({ name: "课程协作" });
  });
  it("副管理员不能授予职务、确认身份或移除管理员", async () => {
    await assignDeputy();
    await expect(updateMemberPositions(fx.student.id, fx.team.id, fx.teacher.id, ["admin"])).rejects.toBeInstanceOf(ForbiddenError);
    const profile = await saveAcademicProfile(fx.teacher.id, { identity: "teacher" });
    await expect(confirmAcademicIdentity(fx.student.id, fx.team.id, fx.teacher.id, profile!.version)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeTeamMember(fx.student.id, fx.team.id, fx.admin.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("副管理员能移除普通成员而不能移除其他副管理员", async () => {
    await assignDeputy();
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, ["deputy"]);
    await expect(removeTeamMember(fx.student.id, fx.team.id, fx.teacher.id)).rejects.toBeInstanceOf(ForbiddenError);
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.teacher.id, ["advisor"]);
    await removeTeamMember(fx.student.id, fx.team.id, fx.teacher.id);
    expect((await listTeamMembers(fx.admin.id, fx.team.id)).some((member) => member.id === fx.teacher.id)).toBe(false);
  });
  it("不能将最后管理员降为副管理员，存在副管理员也不能退出", async () => {
    await assignDeputy();
    await expect(updateMemberPositions(fx.admin.id, fx.team.id, fx.admin.id, ["deputy"])).rejects.toBeInstanceOf(ConflictError);
    await expect(leaveTeam(fx.admin.id, fx.team.id)).rejects.toBeInstanceOf(ConflictError);
  });
  it("职务页面读取的版本必须匹配，旧版本不能覆盖新职务", async () => {
    const initial = (await listTeamMembers(fx.admin.id, fx.team.id)).find((member) => member.id === fx.student.id)!;
    expect(initial.positionVersion).toBeNull();
    const saved = await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["deputy"], initial.positionVersion);
    await expect(updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["member"], initial.positionVersion)).rejects.toBeInstanceOf(ConflictError);
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["deputy", "leader", "member"], saved.positionVersion);
    expect((await listTeamMembers(fx.admin.id, fx.team.id)).find((member) => member.id === fx.student.id)?.positions).toEqual(["deputy", "leader", "member"]);
  });
  it("撤销副管理员后立即失去日常管理能力，学术身份不会保留权限", async () => {
    await assignDeputy();
    await saveAcademicProfile(fx.student.id, { identity: "doctoral" });
    await updateMemberPositions(fx.admin.id, fx.team.id, fx.student.id, ["member"]);
    await expect(updateTeamInformation(fx.student.id, fx.team.id, { version: 1, name: "越权更新", description: "" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(mutateProjectDirectory(fx.student.id, fx.team.id, { op: "create", name: "越权目录", parentId: null })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

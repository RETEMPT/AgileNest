import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  createTeam,
  listTeamMembers,
  listTeamSpaces,
  updateMemberRole,
} from "@/modules/identity";
import { AppError, ConflictError, ForbiddenError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("团队空间与成员管理", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });

  it("空间卡片汇总成员与进行中项目", async () => {
    const spaces = await listTeamSpaces(fx.student.id);
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({
      id: fx.team.id,
      memberCount: 3,
      projectCount: 1,
      role: "student",
    });
  });
  it("不会展示未加入的空间", async () => {
    await createTeam(fx.outsider.id, "其他实验室");
    expect(
      (await listTeamSpaces(fx.student.id)).map((space) => space.id),
    ).toEqual([fx.team.id]);
  });
  it("读取成员也要求团队访问权限", async () => {
    await expect(
      listTeamMembers(fx.outsider.id, fx.team.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("最后一位管理员不能被降级", async () => {
    await expect(
      updateMemberRole(fx.admin.id, fx.team.id, fx.admin.id, "teacher"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (member) => member.id === fx.admin.id,
      )?.role,
    ).toBe("admin");
  });
  it("管理员交接后可以调整自己的角色", async () => {
    await updateMemberRole(fx.admin.id, fx.team.id, fx.student.id, "admin");
    await updateMemberRole(fx.admin.id, fx.team.id, fx.admin.id, "teacher");
    expect(
      (await listTeamMembers(fx.student.id, fx.team.id)).find(
        (member) => member.id === fx.admin.id,
      )?.role,
    ).toBe("teacher");
  });
  it("并发降级仍保留至少一位管理员", async () => {
    await updateMemberRole(fx.admin.id, fx.team.id, fx.student.id, "admin");
    const results = await Promise.allSettled([
      updateMemberRole(fx.admin.id, fx.team.id, fx.admin.id, "student"),
      updateMemberRole(fx.student.id, fx.team.id, fx.student.id, "student"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await listTeamMembers(fx.teacher.id, fx.team.id)).filter(
        (member) => member.role === "admin",
      ),
    ).toHaveLength(1);
  });
  it("实验室项目保留类型和日期，名称自动去空白", async () => {
    const project = await createProject(fx.admin.id, fx.team.id, {
      name: "  实验室课题  ",
      kind: "lab",
      startDate: "2026-10-02",
      endDate: "2026-12-31",
    });
    expect(project).toMatchObject({
      name: "实验室课题",
      kind: "lab",
      startDate: "2026-10-02",
      endDate: "2026-12-31",
    });
  });
  it("拒绝空名称、无效日期与颠倒的日期区间", async () => {
    for (const input of [
      { name: "  " },
      { name: "课题", startDate: "2026-02-30" },
      { name: "课题", startDate: "2026-11-01", endDate: "2026-10-01" },
    ]) {
      await expect(
        createProject(fx.admin.id, fx.team.id, input),
      ).rejects.toBeInstanceOf(AppError);
    }
    await expect(createTeam(fx.admin.id, "  ")).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

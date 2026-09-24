import { describe, it, expect, beforeEach } from "vitest";
import {
  createTeam,
  joinTeam,
  updateMemberRole,
  createProject,
  listTeamProjects,
  listMyProjects,
  updateProject,
} from "@/modules/identity";
import { getProjectForUser, requireTaskWrite, requireReviewer } from "@/modules/core/permissions";
import { resetDb, makeUser } from "../../helpers";

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "东吴实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const outsider = await makeUser("outsider@example.com");
  return { owner, team, student, outsider };
}

describe("createProject", () => {
  beforeEach(resetDb);

  it("admin 可创建项目，默认 active", async () => {
    const { owner, team } = await scene();
    const p = await createProject(owner.id, team.id, {
      name: "赤壁演习",
      description: "冬季学期项目",
      startDate: "2026-09-01",
      endDate: "2027-01-15",
    });
    expect(p.name).toBe("赤壁演习");
    expect(p.status).toBe("active");
    expect(p.teamId).toBe(team.id);
  });

  it("student 建项目被拒（仅 admin）", async () => {
    const { team, student } = await scene();
    await expect(createProject(student.id, team.id, { name: "私设项目" })).rejects.toThrow(
      "没有权限",
    );
  });
});

describe("listTeamProjects", () => {
  beforeEach(resetDb);

  it("团队成员可列出团队项目", async () => {
    const { owner, team, student } = await scene();
    await createProject(owner.id, team.id, { name: "甲计划" });
    await createProject(owner.id, team.id, { name: "乙计划" });
    const list = await listTeamProjects(student.id, team.id);
    expect(list).toHaveLength(2);
  });

  it("非成员被拒", async () => {
    const { owner, team, outsider } = await scene();
    await createProject(owner.id, team.id, { name: "甲计划" });
    await expect(listTeamProjects(outsider.id, team.id)).rejects.toThrow("没有权限");
  });
});

describe("getProjectForUser", () => {
  beforeEach(resetDb);

  it("成员取得项目与自身角色", async () => {
    const { owner, team, student } = await scene();
    const p = await createProject(owner.id, team.id, { name: "甲计划" });
    const access = await getProjectForUser(student.id, p.id);
    expect(access?.project.id).toBe(p.id);
    expect(access?.role).toBe("student");
  });

  it("非成员得 null（不泄露存在性）", async () => {
    const { owner, team, outsider } = await scene();
    const p = await createProject(owner.id, team.id, { name: "甲计划" });
    expect(await getProjectForUser(outsider.id, p.id)).toBeNull();
  });

  it("项目不存在得 null", async () => {
    const { owner } = await scene();
    expect(
      await getProjectForUser(owner.id, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

describe("listMyProjects", () => {
  beforeEach(resetDb);

  it("聚合我所在全部团队的项目", async () => {
    const owner = await makeUser("owner@example.com");
    const t1 = await createTeam(owner.id, "甲组");
    const t2 = await createTeam(owner.id, "乙组");
    await createProject(owner.id, t1.id, { name: "项目一" });
    await createProject(owner.id, t2.id, { name: "项目二" });

    const list = await listMyProjects(owner.id);
    expect(list).toHaveLength(2);
    const one = list.find((p) => p.name === "项目一")!;
    expect(one.teamName).toBe("甲组");
  });

  it("不含我未加入团队的项目", async () => {
    const owner = await makeUser("owner@example.com");
    const other = await makeUser("other@example.com");
    const mine = await createTeam(owner.id, "我的组");
    const theirs = await createTeam(other.id, "别人的组");
    await createProject(owner.id, mine.id, { name: "我的项目" });
    await createProject(other.id, theirs.id, { name: "别人的项目" });

    const list = await listMyProjects(owner.id);
    expect(list.map((p) => p.name)).toEqual(["我的项目"]);
  });
});

describe("updateProject", () => {
  beforeEach(resetDb);

  it("admin 可改项目名", async () => {
    const { owner, team } = await scene();
    const p = await createProject(owner.id, team.id, { name: "旧名" });
    const updated = await updateProject(owner.id, p.id, { name: "新名" });
    expect(updated.name).toBe("新名");
  });

  it("student 无权改项目", async () => {
    const { owner, team, student } = await scene();
    const p = await createProject(owner.id, team.id, { name: "甲计划" });
    await expect(updateProject(student.id, p.id, { name: "篡改" })).rejects.toThrow(
      "没有权限",
    );
  });
});

describe("requireTaskWrite / requireReviewer", () => {
  beforeEach(resetDb);

  it("student 可写任务，teacher 不可写", async () => {
    const { owner, team, student } = await scene();
    const p = await createProject(owner.id, team.id, { name: "甲计划" });
    await expect(requireTaskWrite(student.id, p.id)).resolves.toBeTruthy();

    const teacher = await makeUser("teacher@example.com");
    await joinTeam(teacher.id, team.inviteCode);
    await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
    await expect(requireTaskWrite(teacher.id, p.id)).rejects.toThrow("没有权限");
  });

  it("teacher 可验收，student 不可验收", async () => {
    const { owner, team, student } = await scene();
    const p = await createProject(owner.id, team.id, { name: "甲计划" });
    const teacher = await makeUser("teacher@example.com");
    await joinTeam(teacher.id, team.inviteCode);
    await updateMemberRole(owner.id, team.id, teacher.id, "teacher");

    await expect(requireReviewer(teacher.id, p.id)).resolves.toBeTruthy();
    await expect(requireReviewer(owner.id, p.id)).resolves.toBeTruthy();
    await expect(requireReviewer(student.id, p.id)).rejects.toThrow("没有权限");
  });
});

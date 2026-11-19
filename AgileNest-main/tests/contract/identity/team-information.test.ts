import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, teamMembers, teamProfiles, teams } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, todayISO } from "@/modules/core";
import {
  createProject, createTeam, createTeamAnnouncement, deleteTeamAnnouncement, getTeamInformation,
  joinTeam, leaveTeam, listTeamAnnouncements, listTeamMembers, listMyTeams, removeTeamMember,
  rotateTeamInvite, updateMemberRole, updateTeamAnnouncement, updateTeamInformation,
} from "@/modules/identity";
import { createTask, transitionTask } from "@/modules/tasks";
import { makeFixture, resetDb } from "../../helpers";

describe("团队信息、公告与成员关系契约", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => { await resetDb(); fx = await makeFixture(); });

  it("旧团队无需回填可读取版本1，保存真实资料并更新团队名称", async () => {
    const initial = await getTeamInformation(fx.student.id, fx.team.id);
    expect(initial).toMatchObject({ name: fx.team.name, description: "", website: null, contactEmail: null, version: 1, inviteExpiresOn: null });
    const saved = await updateTeamInformation(fx.admin.id, fx.team.id, {
      version: 1, name: "  实验室协作组  ", description: "  研究与协作  ",
      website: "https://example.com/team", contactEmail: "team@example.com",
    });
    expect(saved).toMatchObject({ name: "实验室协作组", description: "研究与协作", version: 2, website: "https://example.com/team", contactEmail: "team@example.com" });
    expect((await listMyTeams(fx.student.id))[0].name).toBe("实验室协作组");
    expect((await getTeamInformation(fx.teacher.id, fx.team.id)).version).toBe(2);
  });

  it("非成员不能读取，队员和指导老师不能更新团队资料", async () => {
    await expect(getTeamInformation(fx.outsider.id, fx.team.id)).rejects.toBeInstanceOf(ForbiddenError);
    for (const actor of [fx.student, fx.teacher]) {
      await expect(updateTeamInformation(actor.id, fx.team.id, { version: 1, name: "越权名称", description: "" })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await getTeamInformation(fx.admin.id, fx.team.id)).name).toBe(fx.team.name);
  });

  it("团队资料旧版本返回冲突且不会覆盖新内容", async () => {
    await updateTeamInformation(fx.admin.id, fx.team.id, { version: 1, name: "已保存名称", description: "新介绍" });
    await expect(updateTeamInformation(fx.admin.id, fx.team.id, { version: 1, name: "过时名称", description: "旧介绍" })).rejects.toBeInstanceOf(ConflictError);
    expect(await getTeamInformation(fx.admin.id, fx.team.id)).toMatchObject({ name: "已保存名称", description: "新介绍", version: 2 });
  });

  it("拒绝非法网站、邮箱和有效期，空联系字段可清除", async () => {
    for (const patch of [{ website: "javascript:alert(1)" }, { contactEmail: "not-an-email" }]) {
      await expect(updateTeamInformation(fx.admin.id, fx.team.id, { version: 1, name: "团队", description: "", ...patch })).rejects.toBeInstanceOf(AppError);
    }
    await expect(rotateTeamInvite(fx.admin.id, fx.team.id, { version: 1, inviteExpiresOn: "2026-02-30" })).rejects.toBeInstanceOf(AppError);
    expect(await updateTeamInformation(fx.admin.id, fx.team.id, { version: 1, name: "团队", description: "", website: "", contactEmail: "" })).toMatchObject({ website: null, contactEmail: null });
  });

  it("管理员发布编辑置顶和删除公告，成员读取真实作者与Markdown正文", async () => {
    const first = await createTeamAnnouncement(fx.admin.id, fx.team.id, { title: "  协作约定  ", body: "# 协作\n\n- 提交验证结果" });
    const pinned = await createTeamAnnouncement(fx.admin.id, fx.team.id, { title: "近期通知", body: "请查看资料中心", pinned: true });
    const list = await listTeamAnnouncements(fx.student.id, fx.team.id);
    expect(list.map((item) => item.id)).toEqual([pinned.id, first.id]);
    expect(list.find((item) => item.id === first.id)).toMatchObject({ title: "协作约定", body: "# 协作\n\n- 提交验证结果", authorName: fx.admin.name, version: 1 });
    const updated = await updateTeamAnnouncement(fx.admin.id, fx.team.id, first.id, { version: 1, title: "新约定", body: "正文已更新", pinned: true });
    expect(updated).toMatchObject({ version: 2, pinned: true, body: "正文已更新" });
    await deleteTeamAnnouncement(fx.admin.id, fx.team.id, first.id, updated.version);
    expect((await listTeamAnnouncements(fx.teacher.id, fx.team.id)).map((item) => item.id)).toEqual([pinned.id]);
  });

  it("公告读写均检查团队归属，非管理员不能创建编辑或删除", async () => {
    const announcement = await createTeamAnnouncement(fx.admin.id, fx.team.id, { title: "公告", body: "原文" });
    await expect(listTeamAnnouncements(fx.outsider.id, fx.team.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTeamAnnouncement(fx.student.id, fx.team.id, { title: "越权", body: "内容" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateTeamAnnouncement(fx.teacher.id, fx.team.id, announcement.id, { version: 1, title: "越权", body: "内容", pinned: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteTeamAnnouncement(fx.student.id, fx.team.id, announcement.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    const other = await createTeam(fx.admin.id, "其他团队");
    await expect(updateTeamAnnouncement(fx.admin.id, other.id, announcement.id, { version: 1, title: "跨团队", body: "内容", pinned: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTeamAnnouncement(fx.admin.id, other.id, announcement.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listTeamAnnouncements(fx.admin.id, fx.team.id))[0].body).toBe("原文");
  });

  it("公告旧版本更新或删除均冲突，空公告不能发布", async () => {
    const announcement = await createTeamAnnouncement(fx.admin.id, fx.team.id, { title: "公告", body: "原文" });
    await updateTeamAnnouncement(fx.admin.id, fx.team.id, announcement.id, { version: 1, title: "已修改", body: "新原文", pinned: false });
    await expect(updateTeamAnnouncement(fx.admin.id, fx.team.id, announcement.id, { version: 1, title: "过期", body: "旧原文", pinned: true })).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteTeamAnnouncement(fx.admin.id, fx.team.id, announcement.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(createTeamAnnouncement(fx.admin.id, fx.team.id, { title: " ", body: "" })).rejects.toBeInstanceOf(AppError);
    expect((await listTeamAnnouncements(fx.admin.id, fx.team.id))[0].body).toBe("新原文");
  });

  it("邀请码刷新撤销旧码，含当天有效，刷新保留团队资料", async () => {
    const saved = await updateTeamInformation(fx.admin.id, fx.team.id, { version: 1, name: "团队", description: "保留的介绍" });
    const rotated = await rotateTeamInvite(fx.admin.id, fx.team.id, { version: saved.version, inviteExpiresOn: todayISO() });
    expect(rotated.inviteCode).not.toBe(fx.team.inviteCode);
    expect(rotated).toMatchObject({ version: 3, inviteExpiresOn: todayISO(), description: "保留的介绍" });
    await expect(joinTeam(fx.outsider.id, fx.team.inviteCode)).rejects.toBeInstanceOf(AppError);
    await expect(joinTeam(fx.outsider.id, rotated.inviteCode)).resolves.toMatchObject({ teamId: fx.team.id });
    await expect(rotateTeamInvite(fx.student.id, fx.team.id, { version: 3 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rotateTeamInvite(fx.admin.id, fx.team.id, { version: 2 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("已过期的邀请码不能新增成员", async () => {
    await db.insert(teamProfiles).values({ teamId: fx.team.id, inviteExpiresOn: "2000-01-01" });
    await expect(joinTeam(fx.outsider.id, fx.team.inviteCode)).rejects.toThrow("邀请码已过期");
    expect(await listTeamMembers(fx.admin.id, fx.team.id)).toHaveLength(3);
  });

  it("加入等待团队锁后重新检查旧码，不能绕过并发撤销", async () => {
    let release!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const refreshing = db.transaction(async (tx) => {
      await tx.select().from(teams).where(eq(teams.id, fx.team.id)).for("update");
      await tx.update(teams).set({ inviteCode: "new-code-for-race" }).where(eq(teams.id, fx.team.id));
      locked();
      await hold;
    });
    await ready;
    const joining = joinTeam(fx.outsider.id, fx.team.inviteCode);
    joining.catch(() => {});
    try { await new Promise((resolve) => setTimeout(resolve, 100)); }
    finally { release(); await refreshing; }
    await expect(joining).rejects.toBeInstanceOf(AppError);
    expect(await listTeamMembers(fx.admin.id, fx.team.id)).toHaveLength(3);
  });

  it("最后管理员不能退出，并发管理员退出仍留一位管理员", async () => {
    await expect(leaveTeam(fx.admin.id, fx.team.id)).rejects.toBeInstanceOf(ConflictError);
    await updateMemberRole(fx.admin.id, fx.team.id, fx.student.id, "admin");
    const results = await Promise.allSettled([leaveTeam(fx.admin.id, fx.team.id), leaveTeam(fx.student.id, fx.team.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await listTeamMembers(fx.teacher.id, fx.team.id)).filter((member) => member.role === "admin")).toHaveLength(1);
  });

  it("有未完成任务的成员不能退出或被移除，转交后可移除", async () => {
    const task = await createTask(fx.admin.id, fx.project.id, { title: "仍在负责的任务", assigneeId: fx.student.id });
    await expect(leaveTeam(fx.student.id, fx.team.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(removeTeamMember(fx.admin.id, fx.team.id, fx.student.id)).rejects.toBeInstanceOf(ConflictError);
    await transitionTask(fx.admin.id, task.id, "unclaim");
    await removeTeamMember(fx.admin.id, fx.team.id, fx.student.id);
    expect((await listTeamMembers(fx.admin.id, fx.team.id)).map((member) => member.id)).not.toContain(fx.student.id);
  });

  it("已完成负责人和历史作者保留，不受其他团队未完成任务阻碍", async () => {
    const [historical] = await db.insert(tasks).values({ projectId: fx.project.id, title: "历史已验收任务", status: "accepted", assigneeId: fx.student.id, createdById: fx.student.id }).returning();
    const otherTeam = await createTeam(fx.student.id, "独立团队");
    const otherProject = await createProject(fx.student.id, otherTeam.id, { name: "独立项目" });
    await createTask(fx.student.id, otherProject.id, { title: "其他团队工作", assigneeId: fx.student.id });
    await leaveTeam(fx.student.id, fx.team.id);
    const [preserved] = await db.select().from(tasks).where(eq(tasks.id, historical.id));
    expect(preserved).toMatchObject({ assigneeId: fx.student.id, createdById: fx.student.id, status: "accepted" });
    expect((await listMyTeams(fx.student.id)).map((team) => team.id)).toEqual([otherTeam.id]);
  });

  it("非管理员不能移除他人，目标归属校验不影响其他团队", async () => {
    await expect(removeTeamMember(fx.student.id, fx.team.id, fx.teacher.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeTeamMember(fx.outsider.id, fx.team.id, fx.teacher.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeTeamMember(fx.admin.id, fx.team.id, fx.outsider.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaveTeam(fx.outsider.id, fx.team.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, fx.team.id), eq(teamMembers.userId, fx.teacher.id)))).toHaveLength(1);
  });
});

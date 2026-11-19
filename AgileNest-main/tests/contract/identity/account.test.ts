import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getAccountProfile,
  saveAccountProfile,
  getAvatar,
  saveAcademicProfile,
  confirmAcademicIdentity,
  listTeamMembers,
} from "@/modules/identity";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("个人资料契约", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
  });
  it("首次访问返回姓名邮箱与空头像", async () => {
    const p = await getAccountProfile(fx.student.id);
    expect(p.name).toBe("student");
    expect(p.avatarUrl).toBeNull();
    expect(p.bio).toBe("");
  });
  it("保存姓名和简介，并同步团队成员展示", async () => {
    await saveAccountProfile(fx.student.id, {
      name: "  研究同学  ",
      bio: " 做可复现研究 ",
    });
    const m = (await listTeamMembers(fx.admin.id, fx.team.id)).find(
      (m) => m.id === fx.student.id,
    );
    expect(m?.name).toBe("研究同学");
    expect(m?.bio).toBe("做可复现研究");
    expect((await getAccountProfile(fx.admin.id)).name).toBe("admin");
  });
  it("拒绝空姓名和超长简介，原数据不变", async () => {
    await expect(
      saveAccountProfile(fx.student.id, { name: " " }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      saveAccountProfile(fx.student.id, { name: "x", bio: "x".repeat(301) }),
    ).rejects.toBeInstanceOf(AppError);
    expect((await getAccountProfile(fx.student.id)).name).toBe("student");
  });
  it("不存在的账号不能保存", async () => {
    await expect(
      saveAccountProfile("00000000-0000-4000-8000-000000000000", { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("选填联系方式保存、规范化与清空，其他账号和成员列表不暴露", async () => {
    const contacts = {phone:" +86 138 0000 0000 ",contactEmail:" lab@example.com ",officeAddress:" 实验楼 305 ",qq:"12345678",wechat:"agile_lab",x:"@agilenest",github:"agile-nest"};
    const saved = await saveAccountProfile(fx.student.id,{name:"student",contacts});
    expect(saved.contacts).toEqual({...contacts,phone:contacts.phone.trim(),contactEmail:"lab@example.com",officeAddress:"实验楼 305",x:"agilenest"});
    expect((await getAccountProfile(fx.admin.id)).contacts.phone).toBe("");
    expect((await listTeamMembers(fx.admin.id,fx.team.id)).find((member) => member.id === fx.student.id)).not.toHaveProperty("contacts");
    await saveAccountProfile(fx.student.id,{name:"student",bio:"仅改简介"});
    expect((await getAccountProfile(fx.student.id)).contacts.x).toBe("agilenest");
    await saveAccountProfile(fx.student.id,{name:"student",contacts:{phone:"",contactEmail:"",officeAddress:"",qq:"",wechat:"",x:"",github:""}});
    expect((await getAccountProfile(fx.student.id)).contacts.phone).toBe("");
  });
  it("联系方式或社媒无效时整笔更新回滚", async () => {
    const contacts = {phone:"",contactEmail:"",officeAddress:"",qq:"",wechat:"",x:"",github:""};
    for (const patch of [{phone:"hello"},{phone:"------"},{contactEmail:"not-an-email"},{officeAddress:"x".repeat(151)},{qq:"123"},{wechat:"a"},{x:"https://x.com/name"},{github:"-invalid"}]) {
      await expect(saveAccountProfile(fx.student.id,{name:"不应保存",contacts:{...contacts,...patch}})).rejects.toBeInstanceOf(AppError);
    }
    expect((await getAccountProfile(fx.student.id)).name).toBe("student");
  });
  it("拒绝外部地址、SVG、伪 PNG 和超大头像", async () => {
    for (const avatar of [
      "https://example.com/a.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,YWJj",
      "x".repeat(480001),
    ])
      await expect(
        saveAccountProfile(fx.student.id, { name: "x", avatar }),
      ).rejects.toBeInstanceOf(AppError);
    expect((await getAccountProfile(fx.student.id)).name).toBe("student");
  });
  it("头像读取隔离于本人和同团队成员", async () => {
    await expect(
      getAvatar(fx.outsider.id, fx.student.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAvatar(fx.admin.id, fx.student.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  it("头像保存、保留、读取和移除形成完整闭环", async () => {
    const bytes = readFileSync("tests/contract/identity/avatar.png");
    const result = await saveAccountProfile(fx.student.id, {
      name: "student",
      avatar: `data:image/png;base64,${bytes.toString("base64")}`,
    });
    expect(result.avatarUrl).toMatch(/^\/api\/avatars\/.+\?v=/);
    expect(
      (await getAvatar(fx.admin.id, fx.student.id)).bytes.equals(bytes),
    ).toBe(true);
    expect(
      (
        await saveAccountProfile(fx.student.id, {
          name: "student",
          bio: "只改简介",
        })
      ).avatarUrl,
    ).toBe(result.avatarUrl);
    expect(
      (
        await saveAccountProfile(fx.student.id, {
          name: "student",
          avatar: "remove",
        })
      ).avatarUrl,
    ).toBeNull();
    await expect(
      getAvatar(fx.student.id, fx.student.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("修改姓名使身份确认失效，修改简介不影响确认", async () => {
    const p = await saveAcademicProfile(fx.student.id, {
      identity: "master",
      institution: "示例学校",
      department: "",
      researchFocus: "",
    });
    await confirmAcademicIdentity(
      fx.admin.id,
      fx.team.id,
      fx.student.id,
      p.version,
    );
    await saveAccountProfile(fx.student.id, { name: "student", bio: "简介" });
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (m) => m.id === fx.student.id,
      )?.identityConfirmed,
    ).toBe(true);
    await saveAccountProfile(fx.student.id, { name: "新姓名", bio: "简介" });
    expect(
      (await listTeamMembers(fx.admin.id, fx.team.id)).find(
        (m) => m.id === fx.student.id,
      )?.identityConfirmed,
    ).toBe(false);
  });
});

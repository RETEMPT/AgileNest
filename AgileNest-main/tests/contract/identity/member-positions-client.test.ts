import { describe, expect, it } from "vitest";
import { capabilitiesFor, canRemoveTeamMember, POSITION_META, roleFromPositions, TEAM_POSITIONS } from "@/modules/identity/client";

describe("多重团队职务的公开能力", () => {
  it("独立副管理员与组员标签覆盖五项职务", () => {
    expect(TEAM_POSITIONS).toEqual(["admin", "deputy", "advisor", "leader", "member"]);
    expect(POSITION_META.deputy.label).toBe("副管理员");
    expect(POSITION_META.member.label).toBe("组员");
  });
  it("副管理员可日常管理且不能授权成员或代交成果", () => {
    expect(capabilitiesFor(["deputy"])).toMatchObject({ manageMembers: false, manageTeamInformation: true, manageProjectDirectory: true, manageResources: true, review: true, execute: true, task: { submitForOthers: false, unclaimForOthers: true } });
  });
  it("副管理员管理全部项目场景且能够指派与验收", () => {
    for (const kind of ["course", "lab", "contest", null] as const) {
      const access = capabilitiesFor(["deputy"], kind);
      expect(access.manageProject).toBe(true);
      expect(access.task.actions).toEqual(expect.arrayContaining(["assign", "accept", "reject", "reopen"]));
    }
  });
  it("副管理员的兼容角色不升级为管理员", () => {
    expect(roleFromPositions(["deputy", "member"])).toBe("teacher");
    expect(roleFromPositions(["deputy", "admin"])).toBe("admin");
  });
  it("指导老师和队长保持既有权限，职务叠加求并集", () => {
    expect(capabilitiesFor(["advisor", "leader"], "lab")).toMatchObject({ review: true, manageProject: true, manageMembers: false, manageResources: false });
    expect(capabilitiesFor(["member"], "course")).toMatchObject({ execute: true, review: false, manageTeamInformation: false, manageProjectDirectory: false });
  });
  it("副管理员仅移除普通成员，管理员可管理其他管理者", () => {
    expect(canRemoveTeamMember(["deputy"], ["advisor", "member"])).toBe(true);
    expect(canRemoveTeamMember(["deputy"], ["admin", "member"])).toBe(false);
    expect(canRemoveTeamMember(["deputy"], ["deputy", "leader"])).toBe(false);
    expect(canRemoveTeamMember(["admin"], ["deputy"])).toBe(true);
    expect(canRemoveTeamMember(["member"], ["member"])).toBe(false);
  });
});

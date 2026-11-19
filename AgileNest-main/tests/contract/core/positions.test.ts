import { describe, expect, it } from "vitest";
import {
  capabilitiesFor,
  positionsFromRole,
  roleFromPositions,
} from "@/modules/identity/client";

describe("团队职务权限并集", () => {
  it("旧角色保持原有职务", () => {
    expect(positionsFromRole("teacher")).toEqual(["advisor"]);
    expect(positionsFromRole("student")).toEqual(["member"]);
  });
  it("指导老师叠加队员可以执行并验收", () => {
    const access = capabilitiesFor(["advisor", "member"], "lab");
    expect(access.execute).toBe(true);
    expect(access.review).toBe(true);
    expect(access.task.submitForOthers).toBe(false);
  });
  it("队长仅协调实验室与竞赛", () => {
    expect(capabilitiesFor(["leader"], "lab").manageProject).toBe(true);
    expect(capabilitiesFor(["leader"], "contest").task.actions).toContain(
      "assign",
    );
    expect(capabilitiesFor(["leader"], "course").task.actions).not.toContain(
      "assign",
    );
  });
  it("队长没有验收和成员管理权限", () => {
    const access = capabilitiesFor(["leader", "member"], "lab");
    expect(access.review).toBe(false);
    expect(access.manageMembers).toBe(false);
    expect(access.task.actions).not.toContain("accept");
  });
  it("管理员拥有完整权限", () => {
    expect(capabilitiesFor(["admin"], "course").task.submitForOthers).toBe(
      true,
    );
    expect(capabilitiesFor(["admin"]).manageMembers).toBe(true);
  });
  it("兼容角色由职务推导", () => {
    expect(roleFromPositions(["advisor", "member"])).toBe("teacher");
    expect(roleFromPositions(["leader", "admin"])).toBe("admin");
  });
});

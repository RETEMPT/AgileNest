import { describe, it, expect } from "vitest";
import {
  ACTION_ROLES,
  allowedActions,
  findTransition,
} from "@/modules/tasks/states";

describe("states 角色白名单", () => {
  it("教师端（admin/teacher）不做学生动作", () => {
    expect(allowedActions("unclaimed", "admin")).not.toContain("claim");
    expect(allowedActions("in_progress", "admin")).not.toContain("submit");
    expect(allowedActions("rejected", "admin")).not.toContain("resubmit");
    expect(allowedActions("in_progress", "teacher")).not.toContain("submit");
  });

  it("admin/teacher 保留验收类动作", () => {
    expect(allowedActions("submitted", "admin")).toContain("accept");
    expect(allowedActions("submitted", "admin")).toContain("reject");
    expect(allowedActions("submitted", "teacher")).toContain("accept");
  });

  it("student 保留学生动作", () => {
    expect(allowedActions("unclaimed", "student")).toContain("claim");
    expect(allowedActions("in_progress", "student")).toContain("submit");
    expect(allowedActions("rejected", "student")).toContain("resubmit");
  });

  it("每个转移动作都有非空角色白名单", () => {
    for (const action of Object.keys(ACTION_ROLES) as (keyof typeof ACTION_ROLES)[]) {
      expect(ACTION_ROLES[action].length).toBeGreaterThan(0);
    }
  });

  it("非法边返回 null", () => {
    expect(findTransition("claim", "accepted")).toBeNull();
    expect(findTransition("accept", "unclaimed")).toBeNull();
    expect(findTransition("submit", "rejected")).toBeNull();
  });
});

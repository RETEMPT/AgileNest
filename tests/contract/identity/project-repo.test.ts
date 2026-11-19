import { describe, it, expect } from "vitest";
import { parseProjectRepo } from "@/modules/identity/client";

describe("parseProjectRepo", () => {
  it("可从项目描述中解析标准 GitHub 仓库地址", () => {
    const info = parseProjectRepo(
      "这是一个前后端分离项目 · 代码仓库 https://github.com/my-org/web-app",
      "自定义项目"
    );
    expect(info).toEqual({
      owner: "my-org",
      repo: "web-app",
      url: "https://github.com/my-org/web-app",
    });
  });

  it("可正确剔除 .git 后缀", () => {
    const info = parseProjectRepo(
      "源码托管在 https://github.com/RETEMPT/AgileNest.git 欢迎提交 PR",
      "任意项目"
    );
    expect(info).toEqual({
      owner: "RETEMPT",
      repo: "AgileNest",
      url: "https://github.com/RETEMPT/AgileNest",
    });
  });

  it("当没有指定 GitHub 链接时，演示项目（AgileCampus 或 AgileNest）默认关联 RETEMPT/AgileNest", () => {
    const info1 = parseProjectRepo("开题 → 中期 → 结题", "AgileCampus 课设");
    expect(info1).toEqual({
      owner: "RETEMPT",
      repo: "AgileNest",
      url: "https://github.com/RETEMPT/AgileNest",
    });

    const info2 = parseProjectRepo(null, "AgileNest 敏捷协作平台");
    expect(info2).toEqual({
      owner: "RETEMPT",
      repo: "AgileNest",
      url: "https://github.com/RETEMPT/AgileNest",
    });
  });

  it("普通项目且无 GitHub 链接时返回 null，不造成页面干扰", () => {
    const info = parseProjectRepo("普通数学建模竞赛", "校内数模竞赛");
    expect(info).toBeNull();
  });

  it("处理空值和边界情况", () => {
    expect(parseProjectRepo(null, undefined)).toBeNull();
    expect(parseProjectRepo("", "")).toBeNull();
    expect(parseProjectRepo("https://gitlab.com/foo/bar", "普通项目")).toBeNull();
  });
});

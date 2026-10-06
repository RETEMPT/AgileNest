import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { bindFeishu, findOrCreateByFeishu } from "@/lib/user";
import {
  disconnectFeishu,
  getFeishuConnection,
  getAccountProfile,
  saveAccountProfile,
  saveAcademicProfile,
  confirmAcademicIdentity,
  listTeamMembers,
} from "@/modules/identity";
import { AppError, ConflictError, NotFoundError } from "@/modules/core";
import { makeFixture, resetDb } from "../../helpers";

describe("飞书可选连接契约", () => {
  let fx: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    await resetDb();
    fx = await makeFixture();
    vi.stubEnv("FEISHU_APP_ID", "");
    vi.stubEnv("FEISHU_APP_SECRET", "");
    vi.stubEnv("FEISHU_REDIRECT_URI", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function connectStudent() {
    await bindFeishu(fx.student.id, { openId: "ou_student", name: "飞书同学" });
    return (await getFeishuConnection(fx.student.id)).bindingVersion!;
  }

  it("未配置时连接不可用，平台个人资料仍可保存", async () => {
    expect(await getFeishuConnection(fx.student.id)).toEqual({
      connected: false,
      configured: false,
      name: null,
      boundAt: null,
      bindingVersion: null,
      canDisconnect: false,
    });
    await saveAccountProfile(fx.student.id, { name: "本地姓名", bio: "独立资料" });
    expect((await getAccountProfile(fx.student.id)).bio).toBe("独立资料");
  });

  it("必须同时有应用信息和回调地址才显示绑定入口", async () => {
    vi.stubEnv("FEISHU_APP_ID", "test-app");
    vi.stubEnv("FEISHU_APP_SECRET", "test-secret");
    expect((await getFeishuConnection(fx.student.id)).configured).toBe(false);
    vi.stubEnv("FEISHU_REDIRECT_URI", "http://localhost:3000/api/auth/feishu/callback");
    expect((await getFeishuConnection(fx.student.id)).configured).toBe(true);
    vi.stubEnv("FEISHU_APP_SECRET", "  ");
    expect((await getFeishuConnection(fx.student.id)).configured).toBe(false);
  });

  it("只返回本人绑定摘要，不传开放平台标识或密码，也不自动覆盖姓名", async () => {
    await connectStudent();
    const connection = await getFeishuConnection(fx.student.id);
    expect(connection).toMatchObject({ connected: true, name: "飞书同学", canDisconnect: true });
    expect(connection.bindingVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(connection.boundAt).toBeTruthy();
    expect(connection).not.toHaveProperty("openId");
    expect(connection).not.toHaveProperty("passwordHash");
    expect((await getFeishuConnection(fx.admin.id)).connected).toBe(false);
    expect((await getAccountProfile(fx.student.id)).name).toBe("student");
  });

  it("不存在的操作者不能读取或解绑", async () => {
    const absentId = "00000000-0000-4000-8000-000000000000";
    await expect(getFeishuConnection(absentId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(disconnectFeishu(absentId, { bindingVersion: "a".repeat(64) })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("他人的绑定版本不能用于解绑本人或目标账号", async () => {
    const studentVersion = await connectStudent();
    await bindFeishu(fx.admin.id, { openId: "ou_admin", name: "飞书管理员" });
    await expect(disconnectFeishu(fx.admin.id, { bindingVersion: studentVersion })).rejects.toBeInstanceOf(ConflictError);
    expect((await getFeishuConnection(fx.admin.id)).connected).toBe(true);
    expect((await getFeishuConnection(fx.student.id)).connected).toBe(true);
  });

  it("解绑只清除本人连接，保留本地资料、身份确认和团队职务", async () => {
    const version = await connectStudent();
    await saveAccountProfile(fx.student.id, { name: "student", bio: "研究方向" });
    const academic = await saveAcademicProfile(fx.student.id, { identity: "doctoral" });
    await confirmAcademicIdentity(fx.admin.id, fx.team.id, fx.student.id, academic.version);
    const before = (await listTeamMembers(fx.admin.id, fx.team.id)).find((m) => m.id === fx.student.id)!;
    await disconnectFeishu(fx.student.id, { bindingVersion: version });
    expect((await getFeishuConnection(fx.student.id)).connected).toBe(false);
    expect((await getAccountProfile(fx.student.id)).bio).toBe("研究方向");
    const after = (await listTeamMembers(fx.admin.id, fx.team.id)).find((m) => m.id === fx.student.id)!;
    expect(after.positions).toEqual(before.positions);
    expect(after.identityConfirmed).toBe(true);
    const [row] = await db.select({ openId: users.feishuOpenId, name: users.feishuName, boundAt: users.feishuBoundAt }).from(users).where(eq(users.id, fx.student.id));
    expect(row).toEqual({ openId: null, name: null, boundAt: null });
    await expect(disconnectFeishu(fx.student.id, { bindingVersion: version })).resolves.toBeUndefined();
  });

  it("飞书创建的账号不可丢失唯一登录方式，更换飞书绑定后保护仍生效", async () => {
    const account = await findOrCreateByFeishu({ openId: "ou_only_login", name: "飞书用户" });
    expect((await getFeishuConnection(account.id)).canDisconnect).toBe(false);
    await bindFeishu(account.id, { openId: "ou_rebound", name: "新飞书账号" });
    const connection = await getFeishuConnection(account.id);
    await expect(disconnectFeishu(account.id, { bindingVersion: connection.bindingVersion! })).rejects.toBeInstanceOf(ConflictError);
    expect((await getFeishuConnection(account.id)).connected).toBe(true);
  });

  it("旧页面不能删除新绑定，缺失和伪造版本被拒绝", async () => {
    const oldVersion = await connectStudent();
    await bindFeishu(fx.student.id, { openId: "ou_replacement", name: "新绑定" });
    await expect(disconnectFeishu(fx.student.id, { bindingVersion: oldVersion })).rejects.toBeInstanceOf(ConflictError);
    await expect(disconnectFeishu(fx.student.id, { bindingVersion: "" })).rejects.toBeInstanceOf(AppError);
    expect((await getFeishuConnection(fx.student.id)).name).toBe("新绑定");
  });
});

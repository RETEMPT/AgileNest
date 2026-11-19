import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { personalTaskViews, teamMembers } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { createMyTaskView, deleteMyTaskView, listMyTaskViews, taskViewDELETE, taskViewPATCH, taskViewsGET, taskViewsPOST, updateMyTaskView, type SavedTaskViewInput } from "@/modules/board";
import { savedTaskViewUrl } from "@/modules/board/client";
import { requireApiUser } from "@/lib/api";
import { makeFixture, makeProject, resetDb } from "../../helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => { const actual = await importOriginal<typeof import("@/lib/api")>(); return { ...actual, requireApiUser: vi.fn() }; });
const input: SavedTaskViewInput = { name: "我负责的阻塞任务", layout: "table", groupBy: "assignee", filters: { status: ["in_progress", "rejected"], blocked: true, q: "附件" } };
let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeEach(async () => { vi.clearAllMocks(); await resetDb(); fx = await makeFixture(); });

describe("个人保存视图服务", () => {
  it("成员可创建和读取自己的视图，名称修剪且版本从1开始", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, { ...input, name: ` ${input.name} ` });
    expect(view).toMatchObject({ ...input, projectId: fx.project.id, schemaVersion: 1, version: 1 });
    expect(view).not.toHaveProperty("userId");
    expect(await listMyTaskViews(fx.student.id, fx.project.id)).toEqual([view]);
    expect(await listMyTaskViews(fx.admin.id, fx.project.id)).toEqual([]);
  });
  it("同团队管理员不能修改他人视图，外部账号不能查询项目视图", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, input);
    await expect(updateMyTaskView(fx.admin.id, fx.project.id, view.id, { ...input, version: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteMyTaskView(fx.admin.id, fx.project.id, view.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listMyTaskViews(fx.outsider.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createMyTaskView(fx.outsider.id, fx.project.id, input)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("视图必须同时匹配当前项目，另一个项目不能使用其UUID", async () => {
    const other = await makeProject(fx.admin, fx.team.id, "另一个项目");
    const view = await createMyTaskView(fx.student.id, other.id, input);
    await expect(updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, version: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteMyTaskView(fx.student.id, fx.project.id, view.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listMyTaskViews(fx.student.id, fx.project.id)).toEqual([]);
    expect(await listMyTaskViews(fx.student.id, other.id)).toEqual([view]);
  });
  it("本人同项目名称不区分大小写，失败重命名不覆盖原内容", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, { ...input, name: "My Review" });
    await expect(createMyTaskView(fx.student.id, fx.project.id, { ...input, name: " my review " })).rejects.toBeInstanceOf(AppError);
    const second = await createMyTaskView(fx.student.id, fx.project.id, { ...input, name: "资料验收" });
    await expect(updateMyTaskView(fx.student.id, fx.project.id, second.id, { ...input, name: "MY REVIEW", version: 1 })).rejects.toBeInstanceOf(AppError);
    expect((await listMyTaskViews(fx.student.id, fx.project.id)).find((item) => item.id === second.id)).toMatchObject({ name: "资料验收", version: 1 });
    expect(await createMyTaskView(fx.admin.id, fx.project.id, { ...input, name: view.name })).toMatchObject({ name: view.name });
  });
  it("并发编辑使用版本409，仅一个更新成功且原始创建时间不变", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, input);
    const results = await Promise.allSettled([
      updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, name: "甲", version: 1 }),
      updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, name: "乙", filters: { blocked: false }, version: 1 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toBeInstanceOf(ConflictError);
    const [current] = await listMyTaskViews(fx.student.id, fx.project.id);
    expect(current.version).toBe(2);
    expect(current.createdAt).toBe(view.createdAt);
    await expect(updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, version: 1 })).rejects.toBeInstanceOf(ConflictError);
  });
  it("旧版本不能删除新视图，当前版本删除后再次操作返回404", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, input);
    const updated = await updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, name: "重新命名", version: 1 });
    await expect(deleteMyTaskView(fx.student.id, fx.project.id, view.id, 1)).rejects.toBeInstanceOf(ConflictError);
    expect(await listMyTaskViews(fx.student.id, fx.project.id)).toEqual([updated]);
    await deleteMyTaskView(fx.student.id, fx.project.id, view.id, 2);
    expect(await listMyTaskViews(fx.student.id, fx.project.id)).toEqual([]);
    await expect(deleteMyTaskView(fx.student.id, fx.project.id, view.id, 2)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("离队之后不能读取或修改之前保存的视图", async () => {
    const view = await createMyTaskView(fx.student.id, fx.project.id, input);
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, fx.team.id), eq(teamMembers.userId, fx.student.id)));
    await expect(listMyTaskViews(fx.student.id, fx.project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, version: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteMyTaskView(fx.student.id, fx.project.id, view.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("不存在的标签仍完整保存和恢复，任意URL或所有人字段被拒绝", async () => {
    const labelId = "22222222-2222-4222-8222-222222222222";
    const view = await createMyTaskView(fx.student.id, fx.project.id, { ...input, filters: { labelId, blocked: false } });
    const reopened = new URL(savedTaskViewUrl(view), "https://example.com");
    expect(reopened.searchParams.get("labelId")).toBe(labelId);
    expect(reopened.searchParams.get("blocked")).toBe("0");
    await expect(createMyTaskView(fx.student.id, fx.project.id, { ...input, url: "https://example.com" } as SavedTaskViewInput)).rejects.toBeInstanceOf(AppError);
    await expect(createMyTaskView(fx.student.id, fx.project.id, { ...input, userId: fx.admin.id } as SavedTaskViewInput)).rejects.toBeInstanceOf(AppError);
    expect(await db.select().from(personalTaskViews)).toHaveLength(1);
  });
});

describe("个人保存视图API", () => {
  function context(viewId?: string) { return { params: Promise.resolve({ projectId: fx.project.id, ...(viewId && { viewId }) }) }; }
  function request(method: string, body?: unknown) { return new Request("https://example.com/api/v1/projects/views", { method, ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }); }
  it("创建、查询、更新和删除响应均为本人数据并禁止缓存", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(fx.student);
    const created = await taskViewsPOST(request("POST", input), context());
    expect(created.status).toBe(201);
    const view = await created.json();
    const listed = await taskViewsGET(request("GET"), context());
    expect(await listed.json()).toEqual([view]);
    const itemContext = { params: Promise.resolve({ projectId: fx.project.id, viewId: view.id as string }) };
    const updated = await taskViewPATCH(request("PATCH", { ...input, name: "我的视图", version: 1 }), itemContext);
    expect(updated.status).toBe(200);
    const deleted = await taskViewDELETE(request("DELETE", { version: 2 }), itemContext);
    expect(await deleted.json()).toEqual({ ok: true });
    for (const response of [created, listed, updated, deleted]) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("未登录、跨账号与旧版本请求不返回保存内容且错误也no-store", async () => {
    vi.mocked(requireApiUser).mockRejectedValue(new AppError("未登录", 401));
    const loggedOut = await taskViewsGET(request("GET"), context());
    expect(loggedOut.status).toBe(401);
    const view = await createMyTaskView(fx.student.id, fx.project.id, input);
    vi.mocked(requireApiUser).mockResolvedValue(fx.admin);
    const itemContext = { params: Promise.resolve({ projectId: fx.project.id, viewId: view.id }) };
    const foreign = await taskViewDELETE(request("DELETE", { version: 1 }), itemContext);
    expect(foreign.status).toBe(404);
    vi.mocked(requireApiUser).mockResolvedValue(fx.student);
    await updateMyTaskView(fx.student.id, fx.project.id, view.id, { ...input, version: 1 });
    const stale = await taskViewPATCH(request("PATCH", { ...input, version: 1 }), itemContext);
    expect(stale.status).toBe(409);
    for (const response of [loggedOut, foreign, stale]) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("白名单拒绝详情、任意跳转与伪造本人字段", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(fx.student);
    for (const extra of [{ userId: fx.admin.id }, { url: "https://example.com" }, { task: fx.project.id }]) {
      const response = await taskViewsPOST(request("POST", { ...input, ...extra }), context());
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(await listMyTaskViews(fx.student.id, fx.project.id)).toEqual([]);
  });
  it("没有content-length的过大正文也会被流式限制", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(fx.student);
    const response = await taskViewsPOST(request("POST", { ...input, q: "字".repeat(9000) }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "保存视图内容过大" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await db.select().from(personalTaskViews)).toHaveLength(0);
  });
});

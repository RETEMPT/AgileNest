import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/modules/core";
import { projectCalendarGET } from "@/modules/calendar";
import { requireApiUser } from "@/lib/api";
import { makeFixture, resetDb, addTask } from "./fixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, requireApiUser: vi.fn() };
});
beforeEach(async () => { vi.clearAllMocks(); await resetDb(); });
const request = (projectId: string, extra = "") => new Request(`http://localhost/api/v1/calendar?projectId=${projectId}&year=2026&month=2${extra}`);

describe("项目日历 HTTP 兼容契约", () => {
  it("月格保留 TaskDTO 字段并追加统一事件", async () => {
    const f = await makeFixture();
    vi.mocked(requireApiUser).mockResolvedValue(f.student);
    const task = await addTask({ projectId: f.project.id, dueDate: "2026-02-10", title: "历史任务" });
    const response = await projectCalendarGET(request(f.project.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    const cell = body.cells.find((item: { iso: string }) => item.iso === "2026-02-10");
    expect(cell.tasks[0]).toMatchObject({ id: task.id, status: "unclaimed", projectId: f.project.id });
    expect(cell.events[0]).toMatchObject({ id: task.id, kind: "task" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("日程默认按所选历史月份读取", async () => {
    const f = await makeFixture(); vi.mocked(requireApiUser).mockResolvedValue(f.admin);
    await addTask({ projectId: f.project.id, dueDate: "2026-02-10" });
    const response = await projectCalendarGET(request(f.project.id, "&view=agenda"));
    expect((await response.json()).days).toEqual([expect.objectContaining({ kind: "task", date: "2026-02-10" })]);
  });
  it("月格和日程应用同一个状态筛选", async () => {
    const f = await makeFixture(); vi.mocked(requireApiUser).mockResolvedValue(f.admin);
    await addTask({ projectId: f.project.id, dueDate: "2026-02-10", status: "accepted" });
    const response = await projectCalendarGET(request(f.project.id, "&view=agenda&status=unclaimed"));
    const body = await response.json();
    expect(body.days).toHaveLength(0);
    expect(body.cells.flatMap((cell: { events: unknown[] }) => cell.events)).toHaveLength(0);
  });
  it("团队外账号不能读取项目日历", async () => {
    const f = await makeFixture(); vi.mocked(requireApiUser).mockResolvedValue(f.outsider);
    expect((await projectCalendarGET(request(f.project.id))).status).toBe(403);
  });
  it("未登录返回 401", async () => {
    vi.mocked(requireApiUser).mockRejectedValue(new AppError("请先登录", 401));
    expect((await projectCalendarGET(request("00000000-0000-4000-8000-000000000000"))).status).toBe(401);
  });
  it("缺少参数、非法月份和非法区间返回 400", async () => {
    const f = await makeFixture(); vi.mocked(requireApiUser).mockResolvedValue(f.admin);
    for (const url of ["http://localhost/api/v1/calendar", `http://localhost/api/v1/calendar?projectId=${f.project.id}&year=2026&month=13`, `${request(f.project.id).url}&view=agenda&from=2026-02-30`]) {
      expect((await projectCalendarGET(new Request(url))).status).toBe(400);
    }
  });
});

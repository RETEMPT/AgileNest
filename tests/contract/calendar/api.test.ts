import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/modules/core";
import { requireApiUser } from "@/lib/api";
import {
  schedulesGET,
  schedulesPOST,
  schedulePUT,
  scheduleDELETE,
  listMySchedules,
} from "@/modules/calendar";
import { makeUser, resetDb } from "../../helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, requireApiUser: vi.fn() };
});

const input = { title: "实验室讨论", scheduleDate: "2026-10-05", priority: 1 };
const endpoint = "http://localhost/api/v1/calendar/schedules";
const request = (method: string, body: unknown) =>
  new Request(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const context = (id: string) => ({
  params: Promise.resolve({ scheduleId: id }),
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

describe("calendar 个人日程 HTTP 契约", () => {
  it("新增/按月读取/编辑/删除，HTTP 状态与版本一致", async () => {
    const user = await makeUser("api@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(user);
    const created = await schedulesPOST(request("POST", input));
    expect(created.status).toBe(201);
    const { schedule } = await created.json();
    const listing = await schedulesGET(
      new Request(`${endpoint}?year=2026&month=10`),
    );
    expect(listing.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await listing.json()).schedules[0].id).toBe(schedule.id);
    const updated = await schedulePUT(
      request("PUT", { input: { ...input, title: "新的安排" }, version: 1 }),
      context(schedule.id),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).schedule.version).toBe(2);
    const removed = await scheduleDELETE(
      request("DELETE", { version: 2 }),
      context(schedule.id),
    );
    expect(removed.status).toBe(204);
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([]);
  });

  it("未登录的所有接口返回 401", async () => {
    vi.mocked(requireApiUser).mockRejectedValue(new AppError("未登录", 401));
    const ctx = context("00000000-0000-4000-8000-000000000000");
    for (const response of [
      await schedulesGET(new Request(`${endpoint}?year=2026&month=10`)),
      await schedulesPOST(request("POST", input)),
      await schedulePUT(request("PUT", { input, version: 1 }), ctx),
      await scheduleDELETE(request("DELETE", { version: 1 }), ctx),
    ]) {
      expect(response.status).toBe(401);
    }
  });

  it("接口不接受用户 ID 覆盖当前会话归属", async () => {
    const user = await makeUser("safe@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(user);
    expect(
      (await schedulesPOST(request("POST", { ...input, userId: "other" })))
        .status,
    ).toBe(400);
    expect(
      (
        await schedulesGET(
          new Request(`${endpoint}?year=2026&month=10&userId=other`),
        )
      ).status,
    ).toBe(400);
    expect(await listMySchedules(user.id, 2026, 10)).toEqual([]);
  });

  it("非法 JSON、空参数和非法月份返回 400", async () => {
    const user = await makeUser("bad@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(user);
    expect(
      (
        await schedulesPOST(
          new Request(endpoint, { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect((await schedulesGET(new Request(endpoint))).status).toBe(400);
    expect(
      (await schedulesGET(new Request(`${endpoint}?year=2026&month=13`)))
        .status,
    ).toBe(400);
    expect(
      (
        await schedulesPOST(
          request("POST", { ...input, scheduleDate: "2026-02-30" }),
        )
      ).status,
    ).toBe(400);
  });

  it("他人日程不可编辑或删除，返回 404 而不泄露归属", async () => {
    const user = await makeUser("first@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(user);
    const { schedule } = await (
      await schedulesPOST(request("POST", input))
    ).json();
    const other = await makeUser("second@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(other);
    expect(
      (
        await schedulePUT(
          request("PUT", { input, version: 1 }),
          context(schedule.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await scheduleDELETE(
          request("DELETE", { version: 1 }),
          context(schedule.id),
        )
      ).status,
    ).toBe(404);
  });

  it("旧版本 HTTP 返回 409，缺版本返回 400", async () => {
    const user = await makeUser("stale@agilenest.local");
    vi.mocked(requireApiUser).mockResolvedValue(user);
    const { schedule } = await (
      await schedulesPOST(request("POST", input))
    ).json();
    const ctx = context(schedule.id);
    await schedulePUT(request("PUT", { input, version: 1 }), ctx);
    expect(
      (await schedulePUT(request("PUT", { input, version: 1 }), ctx)).status,
    ).toBe(409);
    expect(
      (await scheduleDELETE(request("DELETE", { version: 1 }), ctx)).status,
    ).toBe(409);
    expect((await scheduleDELETE(request("DELETE", {}), ctx)).status).toBe(400);
  });
});

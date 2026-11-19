import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core";
import { getResource } from "@/modules/resources/service";
import { listResourceFavorites, setResourceFavorite } from "@/modules/resources/favorites-service";
import type { ResourceDTO } from "@/modules/resources/client";
vi.mock("@/modules/resources/service", () => ({ getResource: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
let directory: string;
beforeEach(async () => {
  await mkdir(path.join(process.cwd(), ".next"), { recursive: true });
  directory = await mkdtemp(path.join(process.cwd(), ".next", "favorites-test-"));
  vi.stubEnv("RESOURCE_FAVORITES_DIR", directory);
  vi.mocked(getResource).mockImplementation(async (_actor, resourceId) => ({ id: resourceId, title: "资料", teamId: "team", projectId: null, tags: [], body: "private body", kind: "document", url: null, fileName: null, mimeType: null, size: 0, category: "general", version: 1, createdById: null, authorName: null, updatedAt: "2026-10-19", createdAt: "2026-10-19", canManage: true, referenced: false }) as ResourceDTO);
});
afterEach(async () => { vi.unstubAllEnvs(); vi.clearAllMocks(); await rm(directory, { recursive: true, force: true }); });
describe("personal resource favorites", () => {
  it("starts empty", async () => { expect(await listResourceFavorites("alice")).toEqual([]); });
  it("persists without returning document bodies", async () => { await setResourceFavorite("alice", id, true); expect(await listResourceFavorites("alice")).toEqual([{ id, title: "资料", teamId: "team", projectId: null, tags: [] }]); });
  it("isolates accounts", async () => { await setResourceFavorite("alice", id, true); expect(await listResourceFavorites("bob")).toEqual([]); });
  it("deduplicates and cancels", async () => { await setResourceFavorite("alice", id, true); await setResourceFavorite("alice", id, true); expect(await listResourceFavorites("alice")).toHaveLength(1); await setResourceFavorite("alice", id, false); expect(await listResourceFavorites("alice")).toEqual([]); });
  it("rejects inaccessible additions", async () => { vi.mocked(getResource).mockRejectedValue(new ForbiddenError()); await expect(setResourceFavorite("alice", id, true)).rejects.toBeInstanceOf(ForbiddenError); expect(await listResourceFavorites("alice")).toEqual([]); });
  it("hides revoked and deleted resources", async () => { await setResourceFavorite("alice", id, true); await setResourceFavorite("alice", second, true); vi.mocked(getResource).mockRejectedValueOnce(new ForbiddenError()).mockRejectedValueOnce(new NotFoundError()); expect(await listResourceFavorites("alice")).toEqual([]); });
  it("preserves concurrent writes", async () => { await Promise.all([setResourceFavorite("alice", id, true), setResourceFavorite("alice", second, true)]); expect(await listResourceFavorites("alice")).toHaveLength(2); });
  it("rejects invalid inputs", async () => { await expect(setResourceFavorite("alice", "bad", true)).rejects.toBeInstanceOf(AppError); });
});

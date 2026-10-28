import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { createAsset, createAssetRequest, decideAssetRequest, deleteAsset, listAssetRequests, listAssets, returnAssetRequest, withdrawAssetRequest } from "@/modules/assets";
import { assetCreateSchema, assetListSchema, assetRequestCreateSchema, assetRequestListSchema, assetRequestSchema } from "@/modules/assets/client";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);

describe("资源池公开边界", () => {
  it("名称、数量与申请校验生效", () => {
    expect(assetCreateSchema.parse({ name: " RTX 4090 ", totalQuantity: 8 })).toEqual({ name: "RTX 4090", totalQuantity: 8, note: "" });
    expect(assetCreateSchema.safeParse({ name: "  ", totalQuantity: 8 }).success).toBe(false);
    expect(assetCreateSchema.safeParse({ name: "GPU", totalQuantity: 0 }).success).toBe(false);
    expect(assetRequestCreateSchema.safeParse({ assetId: crypto.randomUUID(), quantity: 0 }).success).toBe(false);
    expect(assetRequestCreateSchema.parse({ assetId: crypto.randomUUID(), quantity: 2 }).purpose).toBe("");
    expect(assetListSchema.parse({ assets: [], canManage: false }).assets).toEqual([]);
    expect(assetRequestListSchema.parse({ requests: [], canManage: false }).requests).toEqual([]);
    expect(assetRequestSchema.safeParse({ id: crypto.randomUUID(), status: "pending" }).success).toBe(false);
  });
});

describe("资源占用与申请", () => {
  async function assetFixture() {
    const f = await makeFixture();
    const asset = await createAsset(f.teacher.id, f.team.id, { name: "RTX 4090 显卡", totalQuantity: 10, note: "实验室机柜" });
    return { ...f, asset };
  }

  it("教师录入，成员可见可用与占用，外部账号被拒绝", async () => {
    const f = await assetFixture();
    expect(f.asset).toMatchObject({ totalQuantity: 10, occupied: 0, available: 10 });
    await expect(createAsset(f.student.id, f.team.id, { name: "学生越权", totalQuantity: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAssets(f.outsider.id, f.team.id)).rejects.toBeInstanceOf(ForbiddenError);
    const listed = await listAssets(f.student.id, f.team.id);
    expect(listed.canManage).toBe(false);
    expect(listed.assets[0].available).toBe(10);
  });

  it("成员申请，教师批准计入占用，可用数量随之减少", async () => {
    const f = await assetFixture();
    const request = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 3, purpose: "训练模型" });
    expect(request.status).toBe("pending");
    const decided = await decideAssetRequest(f.teacher.id, f.team.id, request.id, { version: 1, decision: "approve" });
    expect(decided.status).toBe("approved");
    const listed = await listAssets(f.student.id, f.team.id);
    expect(listed.assets[0]).toMatchObject({ occupied: 3, available: 7 });
  });

  it("超过可用数量申请或批准被拒绝，且不产生占用", async () => {
    const f = await assetFixture();
    await expect(createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 11 })).rejects.toBeInstanceOf(ConflictError);
    const a = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 8 });
    const b = await createAssetRequest(f.teacher.id, f.team.id, { assetId: f.asset.id, quantity: 8 });
    await decideAssetRequest(f.teacher.id, f.team.id, a.id, { version: 1, decision: "approve" });
    await expect(decideAssetRequest(f.teacher.id, f.team.id, b.id, { version: 1, decision: "approve" })).rejects.toBeInstanceOf(ConflictError);
    expect((await listAssets(f.student.id, f.team.id)).assets[0].occupied).toBe(8);
  });

  it("普通成员只能看自己的申请，教师能看到全部", async () => {
    const f = await assetFixture();
    const studentRequest = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 2 });
    const teacherRequest = await createAssetRequest(f.teacher.id, f.team.id, { assetId: f.asset.id, quantity: 2 });
    const studentView = await listAssetRequests(f.student.id, f.team.id);
    expect(studentView.requests.map((r) => r.id)).toContain(studentRequest.id);
    expect(studentView.requests.map((r) => r.id)).not.toContain(teacherRequest.id);
    const teacherView = await listAssetRequests(f.teacher.id, f.team.id);
    expect(teacherView.requests.map((r) => r.id)).toContain(studentRequest.id);
    expect(teacherView.requests.map((r) => r.id)).toContain(teacherRequest.id);
  });

  it("申请可撤回与归还，版本冲突和越权被拒绝", async () => {
    const f = await assetFixture();
    const request = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 2 });
    await expect(withdrawAssetRequest(f.teacher.id, f.team.id, request.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    const withdrawn = await withdrawAssetRequest(f.student.id, f.team.id, request.id, 1);
    expect(withdrawn.status).toBe("withdrawn");
    const another = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 2 });
    await expect(returnAssetRequest(f.student.id, f.team.id, another.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await decideAssetRequest(f.teacher.id, f.team.id, another.id, { version: 1, decision: "approve" });
    const returned = await returnAssetRequest(f.student.id, f.team.id, another.id, 2);
    expect(returned.status).toBe("returned");
    expect((await listAssets(f.student.id, f.team.id)).assets[0].occupied).toBe(0);
    await expect(decideAssetRequest(f.teacher.id, f.team.id, another.id, { version: 2, decision: "approve" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("删除资源前必须处理进行中申请，旧版本删除被拒绝", async () => {
    const f = await assetFixture();
    const request = await createAssetRequest(f.student.id, f.team.id, { assetId: f.asset.id, quantity: 2 });
    await expect(deleteAsset(f.teacher.id, f.team.id, f.asset.id, 1)).rejects.toBeInstanceOf(ConflictError);
    await decideAssetRequest(f.teacher.id, f.team.id, request.id, { version: 1, decision: "reject" });
    await expect(deleteAsset(f.teacher.id, f.team.id, f.asset.id, 99)).rejects.toBeInstanceOf(ConflictError);
    await deleteAsset(f.teacher.id, f.team.id, f.asset.id, 1);
    expect((await listAssets(f.student.id, f.team.id)).assets).toEqual([]);
  });
});

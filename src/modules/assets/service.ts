import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { assetRequests, assets, memberPositions, teamMembers, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, getTeamMembership } from "@/modules/core";
import { positionsFromRole } from "@/modules/identity/client";
import { assetCreateSchema, assetRequestCreateSchema, assetUpdateSchema, type AssetCreateInput, type AssetDTO, type AssetListDTO, type AssetRequestCreateInput, type AssetRequestDTO, type AssetRequestListDTO, type AssetUpdateInput } from "./client";

type AssetRow = typeof assets.$inferSelect;
type RequestRow = typeof assetRequests.$inferSelect;
type Access = { teamId: string; positions: string[]; canManage: boolean };

function isManager(positions: readonly string[]) {
  return positions.includes("admin") || positions.includes("deputy") || positions.includes("advisor");
}

async function teamAccess(actorId: string, teamId: string): Promise<Access> {
  const membership = await getTeamMembership(actorId, teamId);
  if (!membership) throw new ForbiddenError();
  return { teamId, positions: membership.positions, canManage: isManager(membership.positions) };
}

async function lockTeam(tx: DbTx, actorId: string, teamId: string): Promise<Access> {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
  const [membership] = await tx.select({ role: teamMembers.role, positions: memberPositions.positions })
    .from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)));
  if (!membership) throw new ForbiddenError("你已不在该团队中");
  const positions = membership.positions ?? positionsFromRole(membership.role);
  return { teamId, positions, canManage: isManager(positions) };
}

// 占用数只统计已批准且未归还的申请；已拒绝/撤回/归还不计入。
async function occupancyMap(teamId: string, tx: DbTx = db): Promise<Map<string, number>> {
  const rows = await tx.select({ assetId: assetRequests.assetId, quantity: assetRequests.quantity })
    .from(assetRequests).innerJoin(assets, eq(assetRequests.assetId, assets.id))
    .where(and(eq(assets.teamId, teamId), eq(assetRequests.status, "approved")));
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.assetId, (map.get(row.assetId) ?? 0) + row.quantity);
  return map;
}

function toAssetDTO(row: AssetRow, occupied: number, canManage: boolean): AssetDTO {
  return {
    id: row.id, teamId: row.teamId, name: row.name,
    totalQuantity: row.totalQuantity, occupied, available: Math.max(0, row.totalQuantity - occupied),
    note: row.note, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    canManage,
  };
}

function toRequestDTO(row: RequestRow, assetName: string, applicantName: string | null, actorId: string, canManage: boolean): AssetRequestDTO {
  const applicant = row.applicantId === actorId;
  return {
    id: row.id, assetId: row.assetId, assetName,
    applicantId: row.applicantId, applicantName,
    quantity: row.quantity, purpose: row.purpose, status: row.status,
    decidedById: row.decidedById, decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    canWithdraw: row.status === "pending" && applicant,
    canDecide: row.status === "pending" && canManage,
  };
}

export async function listAssets(actorId: string, teamId: string): Promise<AssetListDTO> {
  const access = await teamAccess(actorId, teamId);
  const rows = await db.select().from(assets).where(eq(assets.teamId, teamId)).orderBy(desc(assets.createdAt), desc(assets.id));
  const occupied = await occupancyMap(teamId);
  return { assets: rows.map((row) => toAssetDTO(row, occupied.get(row.id) ?? 0, access.canManage)), canManage: access.canManage };
}

async function getAsset(actorId: string, teamId: string, assetId: string): Promise<AssetDTO> {
  const access = await teamAccess(actorId, teamId);
  const [row] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.teamId, teamId)));
  if (!row) throw new NotFoundError("资源不存在");
  return toAssetDTO(row, (await occupancyMap(teamId)).get(assetId) ?? 0, access.canManage);
}

export async function createAsset(actorId: string, teamId: string, input: AssetCreateInput): Promise<AssetDTO> {
  const parsed = assetCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const id = await db.transaction(async (tx) => {
    const access = await lockTeam(tx, actorId, teamId);
    if (!access.canManage) throw new ForbiddenError("只有教师或管理员可以录入资源");
    const [created] = await tx.insert(assets).values({ teamId, name: parsed.data.name, totalQuantity: parsed.data.totalQuantity, note: parsed.data.note, createdById: actorId }).returning();
    return created.id;
  });
  return getAsset(actorId, teamId, id);
}

export async function updateAsset(actorId: string, teamId: string, assetId: string, input: AssetUpdateInput): Promise<AssetDTO> {
  const parsed = assetUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await db.transaction(async (tx) => {
    const access = await lockTeam(tx, actorId, teamId);
    if (!access.canManage) throw new ForbiddenError("只有教师或管理员可以维护资源");
    const [row] = await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.teamId, teamId))).for("update");
    if (!row) throw new NotFoundError("资源不存在");
    if (row.version !== parsed.data.version) throw new ConflictError("资源已更新，请重新加载");
    const occupied = (await occupancyMap(teamId, tx)).get(assetId) ?? 0;
    if (parsed.data.totalQuantity < occupied) throw new ConflictError(`总量不能小于当前已占用 ${occupied} 台/件`);
    await tx.update(assets).set({ name: parsed.data.name, totalQuantity: parsed.data.totalQuantity, note: parsed.data.note, version: row.version + 1, updatedAt: new Date() }).where(eq(assets.id, assetId));
  });
  return getAsset(actorId, teamId, assetId);
}

export async function deleteAsset(actorId: string, teamId: string, assetId: string, version: number): Promise<void> {
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("资源版本无效");
  await db.transaction(async (tx) => {
    const access = await lockTeam(tx, actorId, teamId);
    if (!access.canManage) throw new ForbiddenError("只有教师或管理员可以删除资源");
    const [row] = await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.teamId, teamId))).for("update");
    if (!row) throw new NotFoundError("资源不存在");
    if (row.version !== version) throw new ConflictError("资源已更新，请重新加载");
    const active = await tx.select({ id: assetRequests.id }).from(assetRequests).where(and(eq(assetRequests.assetId, assetId), inArray(assetRequests.status, ["pending", "approved"]))).limit(1);
    if (active.length) throw new ConflictError("该资源存在待处理或已占用的申请，请先处理或归还后再删除");
    await tx.delete(assets).where(eq(assets.id, assetId));
  });
}

export async function listAssetRequests(actorId: string, teamId: string): Promise<AssetRequestListDTO> {
  const access = await teamAccess(actorId, teamId);
  const filter = access.canManage ? eq(assets.teamId, teamId) : and(eq(assets.teamId, teamId), eq(assetRequests.applicantId, actorId));
  const rows = await db.select({ request: assetRequests, assetName: assets.name, applicantName: users.name })
    .from(assetRequests).innerJoin(assets, eq(assetRequests.assetId, assets.id))
    .leftJoin(users, eq(users.id, assetRequests.applicantId))
    .where(filter).orderBy(desc(assetRequests.createdAt), desc(assetRequests.id));
  return { requests: rows.map((row) => toRequestDTO(row.request, row.assetName, row.applicantName, actorId, access.canManage)), canManage: access.canManage };
}

async function getAssetRequest(actorId: string, teamId: string, requestId: string): Promise<AssetRequestDTO> {
  const access = await teamAccess(actorId, teamId);
  const [row] = await db.select({ request: assetRequests, assetName: assets.name, applicantName: users.name })
    .from(assetRequests).innerJoin(assets, eq(assetRequests.assetId, assets.id)).leftJoin(users, eq(users.id, assetRequests.applicantId))
    .where(and(eq(assetRequests.id, requestId), eq(assets.teamId, teamId)));
  if (!row) throw new NotFoundError("申请不存在");
  return toRequestDTO(row.request, row.assetName, row.applicantName, actorId, access.canManage);
}

async function lockRequest(tx: DbTx, teamId: string, requestId: string): Promise<{ request: RequestRow; asset: typeof assets.$inferSelect }> {
  const [request] = await tx.select().from(assetRequests).where(eq(assetRequests.id, requestId)).for("update");
  if (!request) throw new NotFoundError("申请不存在");
  const [asset] = await tx.select().from(assets).where(and(eq(assets.id, request.assetId), eq(assets.teamId, teamId))).for("update");
  if (!asset) throw new NotFoundError("申请不存在");
  return { request, asset };
}

export async function createAssetRequest(actorId: string, teamId: string, input: AssetRequestCreateInput): Promise<AssetRequestDTO> {
  const parsed = assetRequestCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const id = await db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId);
    const [asset] = await tx.select().from(assets).where(and(eq(assets.id, parsed.data.assetId), eq(assets.teamId, teamId))).for("update");
    if (!asset) throw new NotFoundError("资源不存在");
    const occupied = await occupancyMap(teamId, tx);
    const available = asset.totalQuantity - (occupied.get(asset.id) ?? 0);
    if (parsed.data.quantity > available) throw new ConflictError(`可用数量不足，当前可用 ${available} 台/件`);
    const [created] = await tx.insert(assetRequests).values({ assetId: asset.id, applicantId: actorId, quantity: parsed.data.quantity, purpose: parsed.data.purpose }).returning();
    return created.id;
  });
  return getAssetRequest(actorId, teamId, id);
}

export async function withdrawAssetRequest(actorId: string, teamId: string, requestId: string, version: number): Promise<AssetRequestDTO> {
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("申请版本无效");
  await db.transaction(async (tx) => {
    await lockTeam(tx, actorId, teamId);
    const { request } = await lockRequest(tx, teamId, requestId);
    if (request.version !== version) throw new ConflictError("申请已更新，请重新加载");
    if (request.status !== "pending") throw new ConflictError("仅待处理的申请可以撤回");
    if (request.applicantId !== actorId) throw new ForbiddenError("仅本人可撤回自己的申请");
    await tx.update(assetRequests).set({ status: "withdrawn", version: request.version + 1, updatedAt: new Date() }).where(eq(assetRequests.id, requestId));
  });
  return getAssetRequest(actorId, teamId, requestId);
}

export async function decideAssetRequest(actorId: string, teamId: string, requestId: string, input: { version: number; decision: "approve" | "reject" }): Promise<AssetRequestDTO> {
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new AppError("申请版本无效");
  await db.transaction(async (tx) => {
    const access = await lockTeam(tx, actorId, teamId);
    if (!access.canManage) throw new ForbiddenError("只有教师或管理员可以审批申请");
    const { request, asset } = await lockRequest(tx, teamId, requestId);
    if (request.version !== input.version) throw new ConflictError("申请已更新，请重新加载");
    if (request.status !== "pending") throw new ConflictError("仅待处理的申请可以审批");
    if (input.decision === "approve") {
      const occupied = await occupancyMap(teamId, tx);
      const available = asset.totalQuantity - (occupied.get(asset.id) ?? 0);
      if (request.quantity > available) throw new ConflictError(`可用数量不足，当前可用 ${available} 台/件`);
    }
    await tx.update(assetRequests).set({ status: input.decision === "approve" ? "approved" : "rejected", decidedById: actorId, decidedAt: new Date(), version: request.version + 1, updatedAt: new Date() }).where(eq(assetRequests.id, requestId));
  });
  return getAssetRequest(actorId, teamId, requestId);
}

export async function returnAssetRequest(actorId: string, teamId: string, requestId: string, version: number): Promise<AssetRequestDTO> {
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("申请版本无效");
  await db.transaction(async (tx) => {
    const access = await lockTeam(tx, actorId, teamId);
    const { request } = await lockRequest(tx, teamId, requestId);
    if (request.version !== version) throw new ConflictError("申请已更新，请重新加载");
    if (request.status !== "approved") throw new ConflictError("仅已批准的申请可以归还");
    if (request.applicantId !== actorId && !access.canManage) throw new ForbiddenError("仅申请人或教师可以归还资源");
    await tx.update(assetRequests).set({ status: "returned", version: request.version + 1, updatedAt: new Date() }).where(eq(assetRequests.id, requestId));
  });
  return getAssetRequest(actorId, teamId, requestId);
}

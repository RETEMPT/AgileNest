import { z } from "zod";

export const ASSET_NAME_LIMIT = 80;
export const ASSET_PURPOSE_LIMIT = 500;
export const ASSET_STATUSES = ["pending", "approved", "rejected", "returned", "withdrawn"] as const;
export type AssetRequestStatus = (typeof ASSET_STATUSES)[number];

export const assetSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  name: z.string(),
  totalQuantity: z.number().int().positive(),
  occupied: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  note: z.string(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canManage: z.boolean(),
});

export const assetListSchema = z.object({ assets: z.array(assetSchema), canManage: z.boolean() });

export const assetCreateSchema = z.object({
  name: z.string().trim().min(1, "请填写资源名称").max(ASSET_NAME_LIMIT, "名称最多 80 字"),
  totalQuantity: z.number().int().min(1, "数量至少为 1").max(100000, "数量过大"),
  note: z.string().trim().max(500, "备注最多 500 字").default(""),
});

export const assetUpdateSchema = assetCreateSchema.extend({ version: z.number().int().positive("资源版本无效") });

export const assetRequestSchema = z.object({
  id: z.uuid(),
  assetId: z.uuid(),
  assetName: z.string(),
  applicantId: z.uuid().nullable(),
  applicantName: z.string().nullable(),
  quantity: z.number().int().positive(),
  purpose: z.string(),
  status: z.enum(ASSET_STATUSES),
  decidedById: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canWithdraw: z.boolean(),
  canDecide: z.boolean(),
});

export const assetRequestListSchema = z.object({ requests: z.array(assetRequestSchema), canManage: z.boolean() });

export const assetRequestCreateSchema = z.object({
  assetId: z.uuid(),
  quantity: z.number().int().min(1, "申请数量至少为 1").max(100000, "数量过大"),
  purpose: z.string().trim().max(ASSET_PURPOSE_LIMIT, "用途最多 500 字").default(""),
});

export type AssetDTO = z.infer<typeof assetSchema>;
export type AssetListDTO = z.infer<typeof assetListSchema>;
export type AssetCreateInput = z.input<typeof assetCreateSchema>;
export type AssetUpdateInput = z.input<typeof assetUpdateSchema>;
export type AssetRequestDTO = z.infer<typeof assetRequestSchema>;
export type AssetRequestListDTO = z.infer<typeof assetRequestListSchema>;
export type AssetRequestCreateInput = z.input<typeof assetRequestCreateSchema>;

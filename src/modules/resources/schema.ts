import { z } from "zod";
import { safeResourceUrl } from "./client";

const title = z.string().trim().min(1, "请填写资料名称").max(160, "名称最多 160 字");
const category = z.enum(["general", "specification", "research", "delivery", "meeting"]);
export const scopeSchema = z.object({ teamId: z.uuid().optional(), projectId: z.uuid().optional() }).refine((v) => v.teamId || v.projectId, "请选择团队或项目");
export const resourceInputSchema = z.object({
  teamId: z.uuid().optional(), projectId: z.uuid().optional(), title,
  kind: z.enum(["document", "link"]), body: z.string().max(200000, "文档最多 20 万字").optional(),
  url: z.string().max(2000).refine(safeResourceUrl, "请使用 http/https 链接").optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  category: z.enum(["general", "specification", "research", "delivery", "meeting"]).default("general"),
  folderId: z.uuid().nullable().default(null),
}).refine((v) => v.teamId || v.projectId, "请选择团队或项目")
  .refine((v) => v.kind !== "link" || !!v.url, "请填写资料链接");
export const resourcePatchSchema = z.object({
  version: z.number().int().min(1), title, body: z.string().max(200000, "文档最多 20 万字").optional(),
  url: z.string().max(2000).refine(safeResourceUrl, "请使用 http/https 链接").nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8),
  category: z.enum(["general", "specification", "research", "delivery", "meeting"]),
  mentionedUserIds: z.array(z.uuid()).max(20).optional(),
});

const version = z.number().int().min(1);
const mentionIds = z.array(z.uuid()).max(20).default([]);
export const folderInputSchema = z.object({ teamId: z.uuid().optional(), projectId: z.uuid().optional(), name: z.string().trim().min(1, "请填写目录名称").max(80), parentId: z.uuid().nullable().default(null), category: category.optional() }).refine((v) => v.teamId || v.projectId, "请选择目录所属空间");
export const folderPatchSchema = z.object({ folderId: z.uuid(), version, name: z.string().trim().min(1).max(80), parentId: z.uuid().nullable() });
export const folderDeleteSchema = z.object({ folderId: z.uuid(), version });
export const resourceRestoreSchema = z.object({ resourceId: z.uuid(), version });
export const uploadPlacementSchema = z.object({ folderId: z.uuid().nullable().default(null), category: category.default("general") });
export const placementSchema = z.object({ resourceId: z.uuid(), version, folderId: z.uuid().nullable(), pinned: z.boolean() });
export const resourceLinkSchema = z.object({ sourceResourceId: z.uuid(), targetResourceId: z.uuid().optional(), targetTaskId: z.uuid().optional() }).refine((v) => Number(!!v.targetResourceId) + Number(!!v.targetTaskId) === 1, "请选择一份资料或一项任务");
export const collaborationSchema = z.object({ resourceId: z.uuid(), version, commentScope: z.enum(["team", "collaborators"]), collaborators: z.array(z.object({ userId: z.uuid(), permission: z.enum(["comment", "edit"]) })).max(100) });
export const commentInputSchema = z.object({ resourceId: z.uuid(), body: z.string().trim().min(1, "请填写评论").max(10000), resourceVersion: version, parentId: z.uuid().nullable().default(null), selectedQuote: z.string().trim().min(1).max(2000).nullable().default(null), line: z.number().int().min(1).nullable().default(null), mentionedUserIds: mentionIds });
export const commentPatchSchema = z.object({ commentId: z.uuid(), version, action: z.enum(["edit", "withdraw", "resolve", "reopen"]), body: z.string().trim().min(1).max(10000).optional(), mentionedUserIds: mentionIds });

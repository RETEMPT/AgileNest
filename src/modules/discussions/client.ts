import { z } from "zod";

export const DISCUSSION_BODY_LIMIT = 10000;
export const DISCUSSION_LIST_LIMIT = 200;
export const discussionMentionSchema = z.object({ userId: z.uuid(), name: z.string() });
export const discussionResourceSchema = z.object({
  id: z.uuid(), title: z.string(), fileName: z.string().nullable(),
  mimeType: z.string().nullable(), size: z.number().int().nonnegative(),
});
export const discussionPostSchema = z.object({
  id: z.uuid(), taskId: z.uuid(), parentId: z.uuid().nullable(),
  body: z.string(), version: z.number().int().positive(),
  createdById: z.uuid().nullable(), authorName: z.string().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  withdrawn: z.boolean(), resolved: z.boolean(),
  resources: z.array(discussionResourceSchema).max(10),
  canEdit: z.boolean(), canWithdraw: z.boolean(), canResolve: z.boolean(),
  mentions: z.array(discussionMentionSchema).max(20).optional(),
});
export const discussionListSchema = z.object({
  posts: z.array(discussionPostSchema), truncated: z.boolean(), limit: z.number().int().positive(),
  nextCursor: z.uuid().nullable().optional(),
});
export const discussionRevisionSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(), body: z.string(),
  kind: z.enum(["create", "edit", "withdraw", "resolve", "reopen"]),
  changedById: z.uuid().nullable(), authorName: z.string().nullable(), createdAt: z.iso.datetime(),
  mentions: z.array(discussionMentionSchema).max(20).optional(),
});
export const discussionHistorySchema = z.object({ revisions: z.array(discussionRevisionSchema) });
export const discussionCreateSchema = z.object({
  body: z.string().trim().max(DISCUSSION_BODY_LIMIT, "讨论正文最多 10000 字").default(""),
  resourceIds: z.array(z.uuid()).max(10, "每条讨论最多 10 份附件").default([]),
  parentId: z.uuid().optional(),
  mentionedUserIds: z.array(z.uuid()).max(20, "每次最多提及 20 位成员").default([]),
}).refine((value) => value.body.length > 0 || value.resourceIds.length > 0, "请填写讨论内容或添加附件");
export const discussionEditSchema = z.object({
  version: z.number().int().positive("讨论版本无效"),
  body: z.string().trim().max(DISCUSSION_BODY_LIMIT, "讨论正文最多 10000 字"),
  mentionedUserIds: z.array(z.uuid()).max(20, "每次最多提及 20 位成员").optional(),
});
export const discussionResolveSchema = z.object({
  version: z.number().int().positive("讨论版本无效"), resolved: z.boolean(),
});
export type DiscussionResourceDTO = z.infer<typeof discussionResourceSchema>;
export type DiscussionPostDTO = z.infer<typeof discussionPostSchema>;
export type DiscussionListDTO = z.infer<typeof discussionListSchema>;
export type DiscussionRevisionDTO = z.infer<typeof discussionRevisionSchema>;
export type DiscussionCreateInput = z.input<typeof discussionCreateSchema>;
export type DiscussionEditInput = z.input<typeof discussionEditSchema>;
export type DiscussionResolveInput = z.input<typeof discussionResolveSchema>;

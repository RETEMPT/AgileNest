import { z } from "zod";

export const COMMENT_BODY_LIMIT = 10000;

export const projectCommentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z.string(),
  version: z.number().int().positive(),
  withdrawn: z.boolean(),
  createdById: z.uuid().nullable(),
  authorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canEdit: z.boolean(),
  canWithdraw: z.boolean(),
});

export const projectCommentListSchema = z.object({ comments: z.array(projectCommentSchema) });

export const projectCommentCreateSchema = z.object({
  body: z.string().trim().min(1, "请填写评论内容").max(COMMENT_BODY_LIMIT, "评论最多 10000 字"),
  parentId: z.uuid().optional(),
});

export const projectCommentEditSchema = z.object({
  version: z.number().int().positive("评论版本无效"),
  body: z.string().trim().min(1, "请填写评论内容").max(COMMENT_BODY_LIMIT, "评论最多 10000 字"),
});

export const projectCommentWithdrawSchema = z.object({ version: z.number().int().positive("评论版本无效") });

export type ProjectCommentDTO = z.infer<typeof projectCommentSchema>;
export type ProjectCommentListDTO = z.infer<typeof projectCommentListSchema>;
export type ProjectCommentCreateInput = z.input<typeof projectCommentCreateSchema>;
export type ProjectCommentEditInput = z.input<typeof projectCommentEditSchema>;

import { z } from "zod";
import { followTargetSchema, notificationPreferencesSchema, notificationTarget } from "./client";

export const followUpdateSchema = z.object({
  target: followTargetSchema,
  following: z.boolean(),
  version: z.number().int().nonnegative(),
}).strict();
export const preferencesUpdateSchema = notificationPreferencesSchema;
export const collaborationNoticeSchema = z.object({
  target: followTargetSchema,
  event: z.enum(["discussion", "resource_comment", "resource_update", "task_update"]),
  title: z.string().trim().min(1, "请填写通知标题").max(200, "通知标题最多 200 字"),
  body: z.string().max(2000, "通知正文最多 2000 字").optional(),
  link: z.string().max(2000).refine((link) => notificationTarget(link) !== null, "通知只能指向平台内的协作事项"),
  mentionedUserIds: z.array(z.uuid()).max(50, "单次最多提及 50 位成员").optional(),
  participantUserIds: z.array(z.uuid()).transform((ids) => [...new Set(ids)]).optional(),
  eventKey: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9_:.-]+$/, "通知事件编号无效"),
}).strict();
export type CollaborationNoticeInput = z.infer<typeof collaborationNoticeSchema>;

import { z } from "zod";
import { isValidISODate } from "@/modules/core/dates";
import { teamNameSchema } from "./schema";

const versionSchema = z.number().int().positive("资料版本无效");
export const teamInviteCodeSchema = z.string().trim().min(1, "请填写邀请码").max(30, "邀请码无效");
const optionalWebsite = z.string().trim().max(2048, "网站地址最多 2048 字").refine((value) => {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "网站需为完整的 http 或 https 地址").nullable().optional().transform((value) => value || null);
const optionalEmail = z.string().trim().max(254, "联系邮箱过长")
  .pipe(z.union([z.literal(""), z.email("联系邮箱格式不正确")]))
  .nullable().optional().transform((value) => value || null);

export const teamInformationSchema = z.object({
  version: versionSchema,
  name: teamNameSchema,
  description: z.string().trim().max(2000, "团队介绍最多 2000 字").default(""),
  website: optionalWebsite,
  contactEmail: optionalEmail,
});

export const teamAnnouncementSchema = z.object({
  title: z.string().trim().min(1, "请填写公告标题").max(160, "公告标题最多 160 字"),
  body: z.string().trim().min(1, "请填写公告正文").max(10000, "公告正文最多 10000 字"),
  pinned: z.boolean().default(false),
});

export const teamAnnouncementUpdateSchema = teamAnnouncementSchema.extend({ version: versionSchema });
export const teamVersionSchema = versionSchema;
export const teamInviteSchema = z.object({
  version: versionSchema,
  inviteExpiresOn: z.iso.date({ error: "有效期需为有效的 YYYY-MM-DD" })
    .refine(isValidISODate, "有效期日期无效").nullable().optional().transform((value) => value ?? null),
});

import { z } from "zod";

export const contactSchema = z.object({
  phone: z.string().trim().max(30, "手机号最多 30 字").refine((value) => !value || (/^\+?[\d ()-]{6,30}$/.test(value) && value.replace(/\D/g, "").length >= 6 && value.replace(/\D/g, "").length <= 18), "请填写有效的手机号"),
  contactEmail: z.string().trim().max(254, "联系邮箱最多 254 字").pipe(z.union([z.literal(""), z.email("请填写有效的联系邮箱")])),
  officeAddress: z.string().trim().max(150, "办公地址最多 150 字"),
  qq: z.string().trim().refine((value) => !value || /^[1-9]\d{4,11}$/.test(value), "QQ 号应为 5–12 位数字"),
  wechat: z.string().trim().max(50, "微信号最多 50 字").refine((value) => !value || /^[a-zA-Z][a-zA-Z\d_-]{5,49}$/.test(value), "微信号需以字母开头，至少 6 位"),
  x: z.string().trim().transform((value) => value.replace(/^@/, "")).refine((value) => !value || /^[a-zA-Z\d_]{1,15}$/.test(value), "X 用户名应为 1–15 位字母、数字或下划线"),
  github: z.string().trim().max(39, "GitHub 用户名最多 39 字").refine((value) => !value || /^(?!-)(?!.*--)[a-zA-Z\d-]+(?<!-)$/.test(value), "请填写有效的 GitHub 用户名"),
});
export type PersonalContacts = z.infer<typeof contactSchema>;
export const EMPTY_CONTACTS: PersonalContacts = { phone: "", contactEmail: "", officeAddress: "", qq: "", wechat: "", x: "", github: "" };

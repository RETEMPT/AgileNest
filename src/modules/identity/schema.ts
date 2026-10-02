import { z } from "zod";
import { isValidISODate } from "@/modules/core";
import { ACADEMIC_IDENTITIES, TEAM_POSITIONS } from "./client";

export const academicProfileSchema = z.object({
  identity: z.enum(ACADEMIC_IDENTITIES, { error: "请选择学术身份" }),
  institution: z.string().trim().max(100, "学校/机构最多 100 字").default(""),
  department: z.string().trim().max(100, "院系最多 100 字").default(""),
  researchFocus: z.string().trim().max(300, "研究方向最多 300 字").default(""),
});
export const positionsSchema = z
  .array(z.enum(TEAM_POSITIONS))
  .min(1, "至少选择一项职务")
  .max(4)
  .transform((values) => [...new Set(values)]);

export const teamNameSchema = z
  .string()
  .trim()
  .min(1, "请填写团队名称")
  .max(80, "团队名称最多 80 字");
const dateSchema = z.iso
  .date({ error: "日期需为有效的 YYYY-MM-DD" })
  .refine(isValidISODate)
  .optional();

export const projectInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "请填写项目名称")
      .max(100, "项目名称最多 100 字"),
    description: z.string().trim().max(2000, "项目说明最多 2000 字").optional(),
    kind: z.enum(["course", "lab", "contest"]).optional(),
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine(
    (input) =>
      !input.startDate || !input.endDate || input.startDate <= input.endDate,
    { message: "结束日期不能早于开始日期", path: ["endDate"] },
  );

export const projectUpdateSchema = z.object({
  name: projectInputSchema.shape.name.optional(),
  description: projectInputSchema.shape.description.nullable(),
  kind: projectInputSchema.shape.kind.nullable(),
  startDate: dateSchema.nullable(),
  endDate: dateSchema.nullable(),
  status: z.enum(["active", "archived"]).optional(),
});

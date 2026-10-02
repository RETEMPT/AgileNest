import { z } from "zod";
import { isValidISODate } from "@/modules/core";

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

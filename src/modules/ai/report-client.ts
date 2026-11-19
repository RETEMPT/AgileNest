import { z } from "zod";

export const projectReportRequestSchema = z.object({
  projectId: z.uuid("请选择项目"),
  kind: z.enum(["weekly", "defense"]).default("weekly"),
  brief: z.string().trim().max(2000, "补充说明最多 2000 字").default(""),
}).strict();
export type ProjectReportRequest = z.infer<typeof projectReportRequestSchema>;

export const projectReportResultSchema = z.object({
  text: z.string().min(1).max(24000),
  model: z.string().min(1).max(120),
}).strict();
export type ProjectReportResult = z.infer<typeof projectReportResultSchema>;

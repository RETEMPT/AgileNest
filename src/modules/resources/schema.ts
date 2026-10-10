import { z } from "zod";
import { safeResourceUrl } from "./client";

const title = z.string().trim().min(1, "请填写资料名称").max(160, "名称最多 160 字");
export const scopeSchema = z.object({ teamId: z.uuid().optional(), projectId: z.uuid().optional() }).refine((v) => v.teamId || v.projectId, "请选择团队或项目");
export const resourceInputSchema = z.object({
  teamId: z.uuid().optional(), projectId: z.uuid().optional(), title,
  kind: z.enum(["document", "link"]), body: z.string().max(200000, "文档最多 20 万字").optional(),
  url: z.string().max(2000).refine(safeResourceUrl, "请使用 http/https 链接").optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  category: z.enum(["general", "specification", "research", "delivery", "meeting"]).default("general"),
}).refine((v) => v.teamId || v.projectId, "请选择团队或项目")
  .refine((v) => v.kind !== "link" || !!v.url, "请填写资料链接");
export const resourcePatchSchema = z.object({
  version: z.number().int().min(1), title, body: z.string().max(200000, "文档最多 20 万字").optional(),
  url: z.string().max(2000).refine(safeResourceUrl, "请使用 http/https 链接").nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8),
  category: z.enum(["general", "specification", "research", "delivery", "meeting"]),
});

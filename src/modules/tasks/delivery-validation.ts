import { z } from "zod";
import type { AcceptanceCriterion } from "./delivery-types";

const note = z.string().trim().max(5000, "说明最多 5000 字").optional();
const criterion = z.object({
  id: z.uuid("验收项无效"),
  text: z.string().trim().min(1, "请填写验收要求").max(1000, "单项验收要求最多 1000 字"),
});

export const requirementsSchema = z.object({
  version: z.number().int().min(0),
  criteria: z.array(criterion).max(30, "最多 30 项验收要求"),
}).refine((value) => new Set(value.criteria.map((item) => item.id)).size === value.criteria.length, "验收项不能重复");

export const deliverySchema = z.object({
  requirementsVersion: z.number().int().min(0),
  summary: z.string().trim().min(1, "请填写完成说明").max(5000, "完成说明最多 5000 字"),
  verification: z.string().trim().min(1, "请填写验证方法与结果").max(10000, "验证结果最多 10000 字"),
  links: z.array(z.object({
    title: z.string().trim().min(1, "请填写链接标题").max(200),
    url: z.url("请填写有效的成果链接").refine((url) => /^https?:\/\//i.test(url), "成果链接只支持 http 或 https"),
  })).max(20, "最多 20 个成果链接"),
  resourceIds: z.array(z.uuid("成果文件无效")).max(10, "最多关联 10 份成果文件"),
  checks: z.array(z.object({ criterionId: z.uuid("验收项无效"), met: z.boolean(), note })).max(30),
}).refine((value) => value.links.length + value.resourceIds.length > 0, "请提供至少一个成果链接或文件");

export const reviewSchema = z.object({
  submissionId: z.string().min(1, "请选择当前提交版本").max(200),
  summary: z.string().trim().min(1, "请填写验收结论或修改要求").max(5000, "验收意见最多 5000 字"),
  checks: z.array(z.object({ criterionId: z.uuid("验收项无效"), passed: z.boolean(), note })).max(30),
});

export function checksMatchCriteria(criteria: readonly AcceptanceCriterion[], checks: readonly { criterionId: string }[]) {
  const ids = new Set(checks.map((check) => check.criterionId));
  return ids.size === checks.length && checks.length === criteria.length && criteria.every((item) => ids.has(item.id));
}

export const transitionBodySchema = z.object({
  action: z.enum(["claim", "unclaim", "assign", "submit", "resubmit", "accept", "reject", "reopen"]),
  note,
  assigneeId: z.uuid("请选择团队成员").optional(),
  delivery: deliverySchema.optional(),
  review: reviewSchema.optional(),
});

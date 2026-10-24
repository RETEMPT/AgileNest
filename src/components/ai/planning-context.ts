import { z } from "zod";

export const planningRequestSchema = z.discriminatedUnion("planning", [z.object({ planning: z.literal("milestone"), projectId: z.uuid(), milestoneId: z.uuid().optional() }), z.object({ planning: z.literal("task"), projectId: z.uuid(), taskId: z.uuid() })]);

export type AiPlanningContext = { projectId: string; milestoneId?: string; taskId?: string; title: string; sourceText?: string };

export function appendPlanningSource(goal: string, source: string) {
  const next = [goal.trimEnd(), source.trim()].filter(Boolean).join("\n\n");
  if (next.length > 30000) throw new Error("来源内容超过目标剩余额度，请先精简目标或选取部分内容");
  return next;
}

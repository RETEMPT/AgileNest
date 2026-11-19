import { taskPlanSchema, type PlanAssistResult, type TaskPlan } from "@/modules/ai/client";

export function appendClarificationAnswers(goal: string, questions: { question: string }[], answers: string[]) {
  const entries = questions.flatMap((item, index) => answers[index]?.trim() ? [`问：${item.question}\n本人确认：${answers[index].trim()}`] : []);
  if (!entries.length) throw new Error("请先填写至少一条答复");
  const next = `${goal}\n\n补充确认：\n${entries.join("\n\n")}`;
  if (next.length > 30000) throw new Error("加入答复后超过 30000 字，请先精简目标或答复");
  return next;
}

export function adoptCriteriaSuggestions(plan: TaskPlan, result: Extract<PlanAssistResult, { mode: "review" }>, selected: number[]) {
  if (!selected.length) throw new Error("请先选择需要采用的改写");
  const nodes = plan.nodes.map((node) => ({ ...node, criteria: [...node.criteria] }));
  for (const index of new Set(selected)) {
    const suggestion = result.suggestions[index];
    const node = nodes.find((item) => item.id === suggestion?.nodeId);
    if (!suggestion?.replacement || !node || node.criteria[suggestion.criterionIndex] !== suggestion.evidence) throw new Error("建议对应的要求已变化，请重新检查");
    node.criteria[suggestion.criterionIndex] = suggestion.replacement;
  }
  for (const node of nodes) if (new Set(node.criteria.map((item) => item.trim())).size !== node.criteria.length) throw new Error("采用后验收要求会重复，请手动调整");
  return taskPlanSchema.parse({ ...plan, nodes });
}

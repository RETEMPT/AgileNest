import { randomUUID } from "node:crypto";
import { getTaskDelivery, saveTaskRequirements, transitionTask } from "@/modules/tasks";

export async function submitEvidence(actorId: string, taskId: string, summary: string, action: "submit" | "resubmit" = "submit") {
  let { requirements } = await getTaskDelivery(actorId, taskId);
  if (!requirements.criteria.length) requirements = await saveTaskRequirements(actorId, taskId, {
    version: requirements.version,
    criteria: [{ id: randomUUID(), text: "提交可核对的成果与验证记录" }],
  });
  return transitionTask(actorId, taskId, action, { delivery: {
    requirementsVersion: requirements.version, summary, verification: "已按测试验收项逐一核对",
    links: [{ title: "测试成果", url: "https://example.test/delivery" }], resourceIds: [],
    checks: requirements.criteria.map((criterion) => ({ criterionId: criterion.id, met: true, note: "已核对" })),
  } });
}

export async function reviewEvidence(actorId: string, taskId: string, action: "accept" | "reject" = "accept", summary = "已核对成果与全部验收项") {
  const { submissions } = await getTaskDelivery(actorId, taskId);
  const current = submissions[0];
  if (!current) throw new Error("测试需要当前提交版本");
  return transitionTask(actorId, taskId, action, { review: {
    submissionId: current.id, summary,
    checks: current.criteria.map((criterion) => ({ criterionId: criterion.id, passed: action === "accept", note: summary })),
  } });
}

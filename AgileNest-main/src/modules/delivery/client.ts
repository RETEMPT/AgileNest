import { z } from "zod";
import type { TaskStatus } from "@/db/schema";
import type { ApprovedTaskSubmission } from "@/modules/tasks";

export type DeliveryCheck = { id: string; text: string; checked: boolean; note: string };
export type DeliverySnapshot = {
  name: string; description: string; ownerId: string | null; ownerName: string | null; dueDate: string | null;
  checklist: DeliveryCheck[]; status: "draft" | "completed"; archived: boolean;
  entries: ApprovedTaskSubmission[];
  issues: { id: string; taskId: string | null; title: string; detail: string; ownerId: string | null; ownerName: string | null; resolved: boolean; resolution: string | null }[];
};
export type DeliveryEntryDTO = ApprovedTaskSubmission & { id: string; currentTaskStatus: TaskStatus; currentTaskTitle: string; createdAt: string };
export type DeliveryIssueDTO = DeliverySnapshot["issues"][number] & { version: number; canResolve: boolean; updatedAt: string };
export type DeliveryRecordDTO = { id: string; action: DeliveryRecordAction; version: number; actorName: string | null; createdAt: string; snapshot: DeliverySnapshot };
export type DeliveryRecordAction = "create" | "edit" | "bind" | "unbind" | "issue" | "resolve" | "reopenIssue" | "complete" | "reopen" | "archive" | "restore";
export const DELIVERY_ACTION_LABELS: Record<DeliveryRecordAction, string> = { create: "建立交付批次", edit: "更新交付清单", bind: "绑定通过版本", unbind: "移除交付关联", issue: "登记评审问题", resolve: "解决评审问题", reopenIssue: "重开评审问题", complete: "确认阶段交付", reopen: "重新开启交付", archive: "归档交付", restore: "恢复交付" };
export type DeliveryBatchDTO = {
  id: string; projectId: string; name: string; description: string; ownerId: string | null; ownerName: string | null; dueDate: string | null;
  checklist: DeliveryCheck[]; status: "draft" | "completed"; archived: boolean; version: number;
  completedByName: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
  entries: DeliveryEntryDTO[]; issues: DeliveryIssueDTO[]; records: DeliveryRecordDTO[]; canOrganize: boolean; canConfirm: boolean;
};
export type DeliveryProjectDTO = { projectId: string; projectName: string; canOrganize: boolean; batches: DeliveryBatchDTO[]; candidates: ApprovedTaskSubmission[]; members: { id: string; name: string | null }[] };

const uuid = z.uuid("请选择有效的项目、任务或成员");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "请选择真实有效的截止日期").nullable();
export const deliveryCheckSchema = z.object({ id: uuid, text: z.string().trim().min(1, "请填写交付检查项").max(1000), checked: z.boolean(), note: z.string().trim().max(3000) }).strict();
export const deliveryBatchInputSchema = z.object({ name: z.string().trim().min(1, "请填写阶段或交付批次名称").max(120), description: z.string().trim().max(10000), ownerId: uuid.nullable(), dueDate: date, checklist: z.array(deliveryCheckSchema).min(1, "至少设置一项交付检查项").max(40) }).strict()
  .refine((value) => new Set(value.checklist.map((item) => item.id)).size === value.checklist.length, "交付检查项不能重复");
export const deliveryBatchCreateSchema = deliveryBatchInputSchema.safeExtend({ requestKey: uuid.optional() });
const version = z.number().int().positive();
export const deliveryMutationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("edit"), version, data: deliveryBatchInputSchema }).strict(),
  z.object({ op: z.literal("bind"), version, taskId: uuid, submissionId: uuid }).strict(),
  z.object({ op: z.literal("unbind"), version, entryId: uuid }).strict(),
  z.object({ op: z.literal("issue"), version, title: z.string().trim().min(1, "请填写问题标题").max(200), detail: z.string().trim().min(1, "请写明问题位置和通过条件").max(10000), ownerId: uuid.nullable(), taskId: uuid.nullable() }).strict(),
  z.object({ op: z.literal("resolve"), version, issueId: uuid, issueVersion: version, resolution: z.string().trim().min(1, "请填写处理结果与验证依据").max(10000) }).strict(),
  z.object({ op: z.literal("reopenIssue"), version, issueId: uuid, issueVersion: version }).strict(),
  ...["complete", "reopen", "archive", "restore"].map((op) => z.object({ op: z.literal(op as "complete" | "reopen" | "archive" | "restore"), version }).strict()),
]);
export type DeliveryBatchInput = z.infer<typeof deliveryBatchInputSchema>;
export type DeliveryMutation = z.infer<typeof deliveryMutationSchema>;

export function deliveryCompletionError(batch: { ownerId: string | null; checklist: readonly { checked: boolean }[]; entries: readonly { currentTaskStatus: TaskStatus }[]; issues: readonly { resolved: boolean }[] }) {
  if (!batch.ownerId) return "请先指定本阶段交付责任人";
  if (!batch.entries.length) return "至少绑定一项已验收通过的任务成果";
  if (!batch.checklist.length || batch.checklist.some((item) => !item.checked)) return "请逐项核对并完成全部交付检查项";
  if (batch.issues.some((issue) => !issue.resolved)) return "仍有未解决的评审问题，请先处理并记录结果";
  if (batch.entries.some((entry) => entry.currentTaskStatus !== "accepted")) return "关联任务的当前状态已变化，请重新完成任务验收后确认交付";
  return null;
}

export function deliveryMarkdown(snapshot: DeliverySnapshot, version: number) {
  const plain = (text: string) => text.replace(/[\r\n]+/g, " ");
  return [`# ${plain(snapshot.name)}`, `交付记录版本：v${version}`, `责任人：${plain(snapshot.ownerName ?? "未指定")}`, `截止日期：${snapshot.dueDate ?? "未设置"}`, `状态：${snapshot.status === "completed" ? "已确认交付" : "整理中"}${snapshot.archived ? " · 已归档" : ""}`, "", snapshot.description, "", "## 交付清单", ...snapshot.checklist.map((item) => `- [${item.checked ? "x" : " "}] ${plain(item.text)}${item.note ? ` — ${plain(item.note)}` : ""}`), "", "## 成果与通过版本", ...snapshot.entries.flatMap((entry) => [`### ${plain(entry.taskTitle)} · 提交 v${entry.submission.version}`, `提交说明：${entry.submission.summary}`, `验证结果：${entry.submission.verification || "历史版本未记录"}`, `验收结论：${entry.submission.review?.summary ?? ""}`, ...entry.submission.resources.map((resource) => `- 文件：${plain(resource.title)}${resource.fileName ? `（${plain(resource.fileName)}）` : ""}`), ...entry.submission.links.map((link) => `- 成果链接：${plain(link.title)} ${link.url}`), ""]), "## 评审问题", ...snapshot.issues.map((issue) => `- ${issue.resolved ? "[已解决]" : "[待处理]"} ${plain(issue.title)}\n  问题与通过条件：${plain(issue.detail)}\n  责任人：${plain(issue.ownerName ?? "未指定")}\n  处理结果：${plain(issue.resolution ?? "待处理")}`)].join("\n");
}

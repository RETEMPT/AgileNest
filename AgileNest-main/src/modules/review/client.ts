import { z } from "zod";
import { addDaysISO, isOverdue } from "@/modules/core/dates";
import type { SubmissionDTO, TaskDeliveryDTO } from "@/modules/tasks/client";

const querySchema = z.object({
  view: z.enum(["mine", "review", "pool"]).catch("mine"),
  q: z.string().trim().transform((value) => value.slice(0, 200)).catch(""),
  projectId: z.string().trim().catch(""),
  due: z.enum(["all", "overdue", "today", "soon", "undated"]).catch("all"),
  status: z.enum(["all", "unclaimed", "in_progress", "rejected", "submitted"]).catch("all"),
  sort: z.enum(["smart", "due", "updated"]).catch("smart"),
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(Number.MAX_SAFE_INTEGER)).catch(1),
});

export type WorkbenchQuery = z.infer<typeof querySchema>;
export type WorkbenchSearchParams = Record<string, string | string[] | undefined>;

export function parseWorkbenchQuery(input: WorkbenchSearchParams): WorkbenchQuery {
  return querySchema.parse(input);
}

export function workbenchUrl(
  query: WorkbenchQuery,
  changes: Partial<WorkbenchQuery> = {},
) {
  const next = { ...query, ...changes };
  if (changes.page === undefined && Object.keys(changes).length > 0) next.page = 1;
  const params = new URLSearchParams({ view: next.view });
  if (next.q) params.set("q", next.q);
  if (next.projectId) params.set("projectId", next.projectId);
  if (next.due !== "all") params.set("due", next.due);
  if (next.status !== "all") params.set("status", next.status);
  if (next.sort !== "smart") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  return `/home?${params}`;
}

type WorkbenchItem = {
  id: string;
  title: string;
  description: string | null;
  projectName: string;
  projectId: string;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  status: "unclaimed" | "in_progress" | "rejected" | "submitted" | "accepted";
};

const priorityOrder = { high: 0, medium: 1, low: 2 };

export function selectWorkbenchItems<T extends WorkbenchItem>(
  items: readonly T[],
  query: WorkbenchQuery,
  today: string,
): T[] {
  const keyword = query.q.toLocaleLowerCase();
  const soonEnd = addDaysISO(today, 6);
  return items
    .filter((item) => {
      if (query.projectId && item.projectId !== query.projectId) return false;
      if (query.status !== "all" && item.status !== query.status) return false;
      if (query.due === "overdue" && !isOverdue(item.dueDate, today)) return false;
      if (query.due === "today" && item.dueDate !== today) return false;
      if (query.due === "undated" && item.dueDate !== null) return false;
      if (
        query.due === "soon" &&
        (!item.dueDate || item.dueDate < today || item.dueDate > soonEnd)
      ) return false;
      return (
        !keyword ||
        [item.title, item.description, item.projectName].some(
          (value) => value?.toLocaleLowerCase().includes(keyword),
        )
      );
    })
    .sort((a, b) => {
      const dueOrder = (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
      if (query.sort === "updated") {
        const updatedOrder = b.updatedAt.getTime() - a.updatedAt.getTime();
        if (updatedOrder) return updatedOrder;
      }
      if (query.sort === "due" && dueOrder) return dueOrder;
      return Number(isOverdue(b.dueDate, today)) - Number(isOverdue(a.dueDate, today)) ||
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        dueOrder ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id);
    });
}

export function paginateWorkbenchItems<T>(items: readonly T[], requestedPage: number) {
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize), page, totalPages,
    start: items.length ? offset + 1 : 0, end: Math.min(offset + pageSize, items.length),
  };
}

const deliveryPayloadSchema = z.object({
  requirements: z.object({
    version: z.number().int().nonnegative(),
    criteria: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
  }),
  submissions: z.array(z.object({
    id: z.string().min(1), taskId: z.string().min(1), version: z.number().int().nonnegative(),
    submittedById: z.string().nullable(), submittedByName: z.string().nullable(),
    submittedAt: z.iso.datetime({ offset: true }), summary: z.string(), verification: z.string(),
    links: z.array(z.object({ title: z.string(), url: z.url({ protocol: /^https?$/ }) })),
    resources: z.array(z.object({
      id: z.uuid(), title: z.string(), fileName: z.string().nullable(), mimeType: z.string().nullable(), size: z.number().int().nonnegative(),
    })),
    criteria: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), met: z.boolean(), note: z.string().optional() })),
    review: z.object({
      action: z.enum(["accept", "reject"]), reviewerName: z.string().nullable(),
      reviewedAt: z.iso.datetime({ offset: true }), summary: z.string(),
      checks: z.array(z.object({ criterionId: z.string().min(1), passed: z.boolean(), note: z.string().optional() })),
    }).nullable(),
    source: z.enum(["structured", "legacy"]),
  })),
});

export function parseTaskDeliveryPayload(input: unknown, taskId: string): TaskDeliveryDTO {
  const data = deliveryPayloadSchema.parse(input);
  if (data.submissions.some((submission) => submission.taskId !== taskId)) throw new Error("提交记录与当前任务不一致");
  return data;
}

export function sortSubmissionVersions<T extends Pick<SubmissionDTO, "id" | "version" | "submittedAt">>(submissions: readonly T[]): T[] {
  return [...submissions].sort((a, b) => b.version - a.version || b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
}

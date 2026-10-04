import { z } from "zod";
import { addDaysISO, isOverdue } from "@/modules/core/dates";

const querySchema = z.object({
  view: z.enum(["mine", "review", "pool"]).catch("mine"),
  q: z.string().trim().transform((value) => value.slice(0, 200)).catch(""),
  projectId: z.string().trim().catch(""),
  due: z.enum(["all", "overdue", "soon"]).catch("all"),
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
  const params = new URLSearchParams({ view: next.view });
  if (next.q) params.set("q", next.q);
  if (next.projectId) params.set("projectId", next.projectId);
  if (next.due !== "all") params.set("due", next.due);
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
      if (query.due === "overdue" && !isOverdue(item.dueDate, today)) return false;
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
    .sort(
      (a, b) =>
        Number(isOverdue(b.dueDate, today)) - Number(isOverdue(a.dueDate, today)) ||
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}

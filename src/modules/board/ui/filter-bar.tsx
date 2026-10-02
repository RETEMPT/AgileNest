"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, TASK_STATUSES } from "@/modules/tasks/states";
import { createTaskAction } from "../actions";
import type { BoardFilters, GroupBy } from "../types";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "按状态" },
  { value: "assignee", label: "按负责人" },
  { value: "priority", label: "按优先级" },
  { value: "milestone", label: "按里程碑" },
];

const PRIORITIES = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

export function FilterBar({
  projectId,
  groupBy,
  filters,
  showGroup = true,
}: {
  projectId: string;
  groupBy: GroupBy;
  filters: BoardFilters;
  showGroup?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(nextGroup: GroupBy, nextFilters: BoardFilters) {
    const p = new URLSearchParams();
    if (nextGroup !== "status") p.set("group", nextGroup);
    if (nextFilters.status?.length) p.set("status", nextFilters.status.join(","));
    if (nextFilters.priority?.length) p.set("priority", nextFilters.priority.join(","));
    if (nextFilters.assigneeId) p.set("assignee", nextFilters.assigneeId);
    if (nextFilters.milestoneId) p.set("milestone", nextFilters.milestoneId);
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  function toggle(list: string[] | undefined, value: string) {
    const next = list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];
    return next;
  }

  const status = filters.status ?? [];
  const priority = filters.priority ?? [];

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    const res = await createTaskAction(projectId, { title: t });
    setCreating(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setTitle("");
    setError(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3">
        {showGroup && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            分组
            <select
              value={groupBy}
              onChange={(e) => apply(e.target.value as GroupBy, filters)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                apply(groupBy, { ...filters, status: toggle(filters.status, s) })
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                status.includes(s)
                  ? "border-brand bg-brand text-white"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() =>
                apply(groupBy, { ...filters, priority: toggle(filters.priority, p.value) })
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                priority.includes(p.value)
                  ? "border-terracotta bg-terracotta text-white"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form className="ml-auto flex items-center gap-2" onSubmit={onCreate}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="新建任务标题…"
            className="w-44"
          />
          <Button type="submit" size="sm" disabled={creating || !title.trim()}>
            {creating ? "…" : "新建"}
          </Button>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

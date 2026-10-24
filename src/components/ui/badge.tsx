import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/db/schema";
import { STATUS_LABELS } from "@/modules/tasks/client";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand",
        secondary: "bg-muted text-muted-foreground",
        outline: "border border-border text-foreground",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-[var(--status-accepted-soft)] text-[var(--status-accepted)]",
        warning: "bg-[var(--status-submitted-soft)] text-[var(--status-submitted)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  unclaimed: "bg-[var(--status-unclaimed-soft)] text-[var(--status-unclaimed)]",
  in_progress: "bg-[var(--status-in-progress-soft)] text-[var(--status-in-progress)]",
  submitted: "bg-[var(--status-submitted-soft)] text-[var(--status-submitted)]",
  accepted: "bg-[var(--status-accepted-soft)] text-[var(--status-accepted)]",
  rejected: "bg-[var(--status-rejected-soft)] text-[var(--status-rejected)]",
};

/** 五态 pill（Linear 式）—— 全站统一状态视觉 */
export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors duration-200",
        STATUS_CLASS[status],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current opacity-80",
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  high: "bg-[var(--status-rejected-soft)] text-[var(--status-rejected)]",
  medium: "bg-[var(--status-submitted-soft)] text-[var(--status-submitted)]",
  low: "bg-[var(--status-unclaimed-soft)] text-[var(--status-unclaimed)]",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function PriorityPill({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        PRIORITY_CLASS[priority],
        className,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

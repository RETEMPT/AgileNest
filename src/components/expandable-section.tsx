"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** 默认收起、只显示标题的板块容器；点击“展开”后显示 children。 */
export function ExpandableSection({
  title,
  badge,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="font-semibold">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {badge}
          {open ? "收起" : "展开"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </section>
  );
}

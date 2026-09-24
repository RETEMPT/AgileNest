"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; roles?: string[] };

const ITEMS: Item[] = [
  { href: "", label: "概览" },
  { href: "/tasks", label: "任务池" },
  { href: "/board", label: "看板" },
  { href: "/table", label: "表格" },
  { href: "/calendar", label: "日历" },
  { href: "/milestones", label: "里程碑" },
  { href: "/review", label: "验收台", roles: ["admin", "teacher"] },
  { href: "/stats", label: "统计" },
  { href: "/settings", label: "设置" },
];

export function ProjectSidebar({
  projectId,
  role,
  name,
}: {
  projectId: string;
  role: string;
  name: string;
}) {
  const pathname = usePathname();
  const base = `/p/${projectId}`;

  return (
    <aside className="w-44 shrink-0">
      <div className="sticky top-20 space-y-1">
        <Link href={base} className="mb-3 block font-display text-sm font-semibold hover:underline">
          {name}
        </Link>
        {ITEMS.filter((it) => !it.roles || it.roles.includes(role)).map((it) => {
          const href = base + it.href;
          const active = it.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={it.href}
              href={href}
              className={cn(
                "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

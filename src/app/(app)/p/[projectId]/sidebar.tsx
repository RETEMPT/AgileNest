"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { POSITION_META, type TeamPosition } from "@/modules/identity/client";
import {
  TasksIcon,
  BoardIcon,
  TableIcon,
  CalendarIcon,
  MilestoneIcon,
  ReviewIcon,
  StatsIcon,
  SettingsIcon,
  WorkbenchIcon,
} from "@/components/icons";

type Item = {
  href: string;
  label: string;
  icon: typeof TasksIcon;
  reviewOnly?: boolean;
};

const ITEMS: Item[] = [
  { href: "", label: "概览", icon: WorkbenchIcon },
  { href: "/tasks", label: "任务池", icon: TasksIcon },
  { href: "/board", label: "看板", icon: BoardIcon },
  { href: "/table", label: "表格", icon: TableIcon },
  { href: "/calendar", label: "日历", icon: CalendarIcon },
  { href: "/milestones", label: "里程碑", icon: MilestoneIcon },
  { href: "/review", label: "验收台", icon: ReviewIcon, reviewOnly: true },
  { href: "/stats", label: "工时统计", icon: StatsIcon },
  { href: "/settings", label: "设置", icon: SettingsIcon },
];

export function ProjectSidebar({
  projectId,
  positions,
  canReview,
  name,
}: {
  projectId: string;
  positions: TeamPosition[];
  canReview: boolean;
  name: string;
}) {
  const pathname = usePathname();
  const base = `/p/${projectId}`;

  return (
    <div className="space-y-4 border-b border-border pb-3">
      {/* 顶部标题与角色 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={base}
            className="font-display text-xl font-bold tracking-tight text-foreground hover:underline"
          >
            {name}
          </Link>
          {positions.map((position) => (
            <Badge key={position} variant="secondary">
              {POSITION_META[position].label}
            </Badge>
          ))}
        </div>
      </div>

      {/* 视图选项卡与独立系统横向滚动栏 */}
      <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
        {ITEMS.filter((it) => !it.reviewOnly || canReview).map((it) => {
          const href = base + it.href;
          const active =
            it.href === "" ? pathname === base : pathname.startsWith(href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={href}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition",
                active
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon
                size={14}
                className={active ? "text-background" : "text-blue-600"}
              />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

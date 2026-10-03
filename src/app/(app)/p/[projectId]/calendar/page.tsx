import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { monthView } from "@/modules/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const now = new Date();
  const year = Number(sp.y) || now.getFullYear();
  const month = Number(sp.m) || now.getMonth() + 1;

  const cells = await monthView(user.id, projectId, year, month);
  const weeks = ["一", "二", "三", "四", "五", "六", "日"];
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">日历</h1>
          <p className="text-sm text-muted-foreground">任务截止 + 里程碑</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/p/${projectId}/calendar?y=${prevY}&m=${prevM}`}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent"
          >
            ←
          </Link>
          <span className="w-24 text-center font-medium">
            {year} 年 {month} 月
          </span>
          <Link
            href={`/p/${projectId}/calendar?y=${nextY}&m=${nextM}`}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent"
          >
            →
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weeks.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.iso}
            className={cn(
              "min-h-[88px] rounded-md border border-border p-1.5",
              c.inMonth ? "bg-card" : "bg-muted/40 opacity-60",
            )}
          >
            <div className="mb-1 text-[11px] text-muted-foreground">
              {Number(c.iso.slice(8, 10))}
            </div>
            <div className="space-y-1">
              {c.milestones.map((m) => (
                <Badge key={m.id} className="w-full justify-start text-[10px]">
                  {m.title}
                </Badge>
              ))}
              {c.tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/p/${projectId}/tasks/${t.id}`}
                  className="block truncate rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-800 hover:bg-amber-100"
                >
                  {t.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

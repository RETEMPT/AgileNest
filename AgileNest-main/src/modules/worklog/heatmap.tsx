import { Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ProgressDay } from "./progress";

const HEAT_LEVELS = ["bg-muted", "bg-brand/25", "bg-brand/45", "bg-brand/70", "bg-brand"] as const;
const HEAT_WEEKDAYS = ["一", "", "三", "", "五", "", ""];

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export function ContributionHeatmap({ days }: { days: ProgressDay[] }) {
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const weeks: ProgressDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  const monthLabels = weeks.map((week, column) => {
    const month = Number(week[0].date.slice(5, 7));
    const previous = column > 0 ? Number(weeks[column - 1][0].date.slice(5, 7)) : -1;
    return month !== previous ? `${month}月` : "";
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-display text-base font-semibold">验收热力图</h2>
          <p className="mt-1 text-xs text-muted-foreground">近 16 周每日验收的顶层任务 · 共 {total} 项</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden="true">
          <span>少</span>
          {HEAT_LEVELS.map((level) => (
            <span key={level} className={`h-3 w-3 rounded-[3px] ${level}`} />
          ))}
          <span>多</span>
        </div>
      </div>
      {total === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <Flame className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">最近 16 周还没有验收记录</p>
          <p className="text-xs text-muted-foreground">任务验收后会按天汇总在这里</p>
        </div>
      ) : (
        <div className="overflow-x-auto px-4 py-4">
          <figure className="inline-flex gap-2" role="img" aria-label={`近 16 周每日验收热力图，共验收 ${total} 项任务`}>
            <div className="flex flex-col gap-[3px] text-[10px] leading-none text-muted-foreground">
              <div className="h-4" />
              {HEAT_WEEKDAYS.map((label, index) => (
                <span key={index} className="flex h-3 items-center">{label}</span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex gap-[3px]">
                {weeks.map((week, column) => (
                  <span key={week[0].date} className="h-4 w-3 shrink-0 whitespace-nowrap text-[10px] leading-none text-muted-foreground">{monthLabels[column]}</span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week) => (
                  <div key={week[0].date} className="flex flex-col gap-[3px]">
                    {week.map((day) => (
                      <span
                        key={day.date}
                        className={`h-3 w-3 rounded-[3px] ${HEAT_LEVELS[heatLevel(day.count)]}`}
                        title={`${day.date}：验收 ${day.count} 项`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </figure>
        </div>
      )}
    </Card>
  );
}

import { ACTION_LABELS } from "@/modules/tasks/client";

export type AuditEvent = {
  id: string;
  taskId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  note?: string | null;
  createdAt: string | Date;
};

const labels: Record<string, string> = ACTION_LABELS;
const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function TaskAuditStream({ events, compact = false }: { events: AuditEvent[]; compact?: boolean }) {
  if (events.length === 0) return <p className="py-3 text-sm text-muted-foreground">暂无任务活动。</p>;
  return <ol aria-label="任务活动记录" className="divide-y divide-border">
    {[...events].reverse().map((event) => <li key={event.id} className={compact ? "py-3" : "py-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><span className="font-medium">{event.actorName || "协作成员"}</span><span className="ml-2 text-muted-foreground">{labels[event.action] || event.action}</span></span>
        <time dateTime={new Date(event.createdAt).toISOString()} className="text-xs tabular-nums text-muted-foreground">{formatter.format(new Date(event.createdAt))}</time>
      </div>
      {event.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{event.note}</p>}
    </li>)}
  </ol>;
}

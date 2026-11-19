import type { ReactNode } from "react";

type TelemetryCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
  progress?: number; // 0 - 100
  icon?: ReactNode;
  className?: string;
};

export function TelemetryCard({
  title,
  value,
  unit,
  badge,
  badgeColor = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200",
  subtitle,
  progress,
  icon,
  className = "",
}: TelemetryCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-200 ease-out hover:shadow-sm hover:-translate-y-0.5 hover:border-foreground/20 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground font-medium">{unit}</span>}
        {badge && (
          <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {subtitle && (
        <p className="mt-2 text-xs text-muted-foreground truncate">{subtitle}</p>
      )}
    </div>
  );
}

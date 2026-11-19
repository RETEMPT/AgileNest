import { cn } from "@/lib/utils";

/** 骨架屏：模块占位期展示 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** 模块占位卡片：未实现页统一视觉 */
export function ModulePlaceholder({
  title,
  owner,
  branch,
  doc,
  className,
}: {
  title: string;
  owner: string;
  branch: string;
  doc?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-card p-8 text-center",
        className,
      )}
    >
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">该模块由对应分支实现中，敬请期待。</p>
      <div className="mx-auto mt-4 max-w-sm space-y-1 rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Owner：</span>
          {owner}
        </p>
        <p>
          <span className="font-medium text-foreground">分支：</span>
          <code className="rounded bg-background px-1">{branch}</code>
        </p>
        {doc && (
          <p>
            <span className="font-medium text-foreground">契约：</span>
            <code className="rounded bg-background px-1">{doc}</code>
          </p>
        )}
      </div>
    </div>
  );
}

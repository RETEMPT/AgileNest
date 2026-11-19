import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { POSITION_META, type TeamPosition } from "./client";

export function ProjectContextHeader({ projectId, name, positions }: {
  projectId: string;
  name: string;
  positions: TeamPosition[];
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link href={`/p/${projectId}`} className="break-words font-medium text-muted-foreground hover:text-brand">{name}</Link>
        <span className="sr-only">我的项目职务：</span>
        {positions.map((position) => <Badge key={position} variant="secondary">{POSITION_META[position].label}</Badge>)}
      </div>
      <Link href={`/p/${projectId}/settings`} className="shrink-0 text-xs text-brand hover:underline">项目设置</Link>
    </div>
  );
}

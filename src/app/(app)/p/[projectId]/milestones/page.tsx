import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { listMilestones } from "@/modules/milestone";
import { MilestoneForm } from "@/modules/tasks/ui";
import { Badge } from "@/components/ui/badge";

const KIND_LABEL: Record<string, string> = {
  open_topic: "开题",
  midterm: "中期",
  final: "结题",
  defense: "答辩",
  custom: "自定义",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待进行",
  done: "已完成",
  missed: "已错过",
};

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();

  const items = await listMilestones(user.id, projectId);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">里程碑</h1>
        <p className="text-sm text-muted-foreground">开题 / 中期 / 结题 / 答辩 / 自定义</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">还没有里程碑</li>
          )}
          {items.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[m.kind] ?? m.kind}
                  {m.targetDate ? ` · 目标 ${m.targetDate}` : " · 未定日期"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge variant="secondary">{KIND_LABEL[m.kind] ?? m.kind}</Badge>
                <Badge variant="outline">{STATUS_LABEL[m.status] ?? m.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
        {access.role !== "student" && <MilestoneForm projectId={projectId} />}
      </div>
    </main>
  );
}

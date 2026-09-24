import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const p = access.project;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">{p.description ?? "暂无描述"}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { href: "tasks", label: "任务池", desc: "创建 / 认领 / 指派 / 子任务" },
          { href: "board", label: "看板", desc: "五列拖拽：待认领 → … → 待修改" },
          { href: "review", label: "验收台", desc: "教师验收通过 / 打回" },
        ].map((c) => (
          <Link key={c.href} href={`/p/${projectId}/${c.href}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{c.label}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>主循环</CardTitle>
          <CardDescription>认领 → 做事（子任务 / 工时）→ 提交 → 验收通过 / 打回待修改</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          五态：待认领 · 进行中 · 待验收 · 已完成 · 待修改。状态机见{" "}
          <code className="rounded bg-muted px-1">src/modules/tasks/states.ts</code>。
        </CardContent>
      </Card>
    </main>
  );
}

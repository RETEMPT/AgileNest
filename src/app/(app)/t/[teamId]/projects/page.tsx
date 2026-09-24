import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getTeamMembership } from "@/modules/core/permissions";
import { listTeamProjects } from "@/modules/identity";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectForm } from "./project-form";

export default async function TeamProjectsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();

  const projects = await listTeamProjects(user.id, teamId);
  const canCreate = membership.role === "admin";

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">项目</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/t" className="text-primary hover:underline">
              ← 团队列表
            </Link>
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href={`/t/${teamId}/members`} className="text-primary hover:underline">
            成员
          </Link>
          <Link href={`/t/${teamId}/settings`} className="text-primary hover:underline">
            设置
          </Link>
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  <Link href={`/p/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </CardTitle>
                <Badge variant={p.status === "active" ? "default" : "secondary"}>
                  {p.status === "active" ? "进行中" : "已归档"}
                </Badge>
              </div>
              <CardDescription>{p.description ?? "暂无描述"}</CardDescription>
            </CardHeader>
          </Card>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有项目{canCreate ? "，右侧创建一个。" : "。"}</p>
        )}
      </div>

      {canCreate && <ProjectForm teamId={teamId} />}
    </main>
  );
}

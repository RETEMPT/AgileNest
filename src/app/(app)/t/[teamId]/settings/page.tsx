import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getTeamMembership } from "@/modules/core/permissions";
import { listMyTeams } from "@/modules/identity";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const teams = await listMyTeams(user.id);
  const team = teams.find((t) => t.id === teamId);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">团队设置</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/t/${teamId}/projects`} className="text-primary hover:underline">
            ← 项目
          </Link>
        </p>
      </header>
      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        <p>
          团队名称：<span className="font-medium">{team?.name}</span>
        </p>
        <p className="mt-2">
          邀请码：<code className="rounded bg-muted px-1.5 py-0.5">{team?.inviteCode}</code>
          <span className="ml-2 text-muted-foreground">分享给同学即可加入（默认角色：学生）</span>
        </p>
      </div>
    </main>
  );
}

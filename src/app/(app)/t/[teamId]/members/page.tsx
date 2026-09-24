import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getTeamMembership } from "@/modules/core/permissions";
import { listTeamMembers } from "@/modules/identity";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};

export default async function TeamMembersPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const members = await listTeamMembers(teamId);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">成员</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/t/${teamId}/projects`} className="text-primary hover:underline">
            ← 项目
          </Link>
        </p>
      </header>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge variant="secondary">{ROLE_LABEL[m.role] ?? m.role}</Badge>
          </li>
        ))}
      </ul>
    </main>
  );
}

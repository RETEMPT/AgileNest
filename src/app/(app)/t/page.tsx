import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyTeams } from "@/modules/identity";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateTeamForm, JoinTeamForm } from "./team-forms";
import { InviteCodePill } from "./invite-code-pill";

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};

export default async function TeamsPage() {
  const user = await requireUser();
  const teams = await listMyTeams(user.id);

  return (
    <main className="space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          团队与空间
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          课程组 · 实验室 · 竞赛战队。凭邀请码加入或创建新团队。
        </p>
      </header>

      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-xs text-muted-foreground">
          你尚未加入任何团队。可通过下方表单创建新团队，或输入邀请码加入现有团队。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <Card key={t.id} className="transition hover:border-border/90 hover:shadow-xs">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    <Link
                      href={`/t/${t.id}/projects`}
                      className="text-base font-bold text-foreground hover:text-blue-600 transition"
                    >
                      {t.name}
                    </Link>
                  </CardTitle>
                  <Badge variant="secondary">{ROLE_LABEL[t.role] ?? t.role}</Badge>
                </div>
                <CardDescription className="flex items-center gap-2 pt-1 text-xs">
                  <span>邀请码:</span>
                  <InviteCodePill code={t.inviteCode} />
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4 border-t border-border/50 pt-3 text-xs font-medium">
                <Link
                  href={`/t/${t.id}/projects`}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  📁 项目列表
                </Link>
                <Link
                  href={`/t/${t.id}/members`}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  👥 成员与角色
                </Link>
                <Link
                  href={`/t/${t.id}/settings`}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  ⚙️ 空间设置
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        <CreateTeamForm />
        <JoinTeamForm />
      </div>
    </main>
  );
}

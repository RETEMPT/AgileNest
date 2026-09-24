import Link from "next/link";
import { requireUser } from "@/modules/core/session";
import { listMyTeams } from "@/modules/identity";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateTeamForm, JoinTeamForm } from "./team-forms";

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
      <header>
        <h1 className="font-display text-2xl font-semibold">我的团队</h1>
        <p className="text-sm text-muted-foreground">课程组 / 实验室 / 竞赛队。凭邀请码加入。</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  <Link href={`/t/${t.id}/projects`} className="hover:underline">
                    {t.name}
                  </Link>
                </CardTitle>
                <Badge variant="secondary">{ROLE_LABEL[t.role] ?? t.role}</Badge>
              </div>
              <CardDescription>
                邀请码 <code className="rounded bg-muted px-1">{t.inviteCode}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 text-sm">
              <Link href={`/t/${t.id}/projects`} className="text-primary hover:underline">
                项目
              </Link>
              <Link href={`/t/${t.id}/members`} className="text-primary hover:underline">
                成员
              </Link>
              <Link href={`/t/${t.id}/settings`} className="text-primary hover:underline">
                设置
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateTeamForm />
        <JoinTeamForm />
      </div>
    </main>
  );
}

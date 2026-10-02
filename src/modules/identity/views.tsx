import Link from "next/link";
import type { ProjectKind } from "@/db/schema";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  FolderKanban,
  Trophy,
  Users,
} from "lucide-react";
import { requireUser, getTeamMembership } from "@/modules/core";
import { listProjectTasks } from "@/modules/tasks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listMyTeams,
  listTeamMembers,
  listTeamProjects,
  listTeamSpaces,
} from "./service";
import {
  TeamEntryActions,
  CreateProjectButton,
  InviteCode,
  MemberRoleForm,
} from "./ui";
export { ProjectOverviewView } from "./project-view";

const ROLE_LABEL = { admin: "管理员", teacher: "教师", student: "学生" };
const KIND_META = {
  course: { title: "课程协作", icon: BookOpen },
  lab: { title: "实验室课题", icon: FlaskConical },
  contest: { title: "竞赛战队", icon: Trophy },
};

function CollaborationPath({ current }: { current: number }) {
  const steps = ["团队空间", "成员与角色", "项目与课题", "任务看板"];
  return (
    <nav
      aria-label="协作上手路径"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {steps.map((step, index) => (
        <div
          key={step}
          className={`flex items-center gap-3 rounded-xl border p-3 ${index === current ? "border-brand/30 bg-brand-soft" : "border-border bg-card"}`}
          aria-current={index === current ? "step" : undefined}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === current ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}
          >
            {index + 1}
          </span>
          <span className="text-sm font-medium">{step}</span>
          {index < 3 && (
            <ArrowRight className="ml-auto hidden h-3 w-3 text-muted-foreground sm:block" />
          )}
        </div>
      ))}
    </nav>
  );
}

export async function TeamSpacesView() {
  const user = await requireUser();
  const teams = await listTeamSpaces(user.id);
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wider text-brand">
            协作从这里开始
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">团队与空间</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            把成员聚在一起，让课程、课题和竞赛有序推进。
          </p>
        </div>
        {teams.length > 0 && <TeamEntryActions />}
      </header>
      <CollaborationPath current={0} />
      {teams.length === 0 ? (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">选择你的起点</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              发起新的协作，或加入已有团队。创建后会引导你建立第一个项目。
            </p>
          </div>
          <TeamEntryActions large />
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              我的空间{" "}
              <span className="ml-2 text-muted-foreground">{teams.length}</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              角色以各团队内的设置为准
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <Card
                key={team.id}
                className="overflow-hidden transition hover:border-brand/35 hover:shadow-sm"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Users className="h-6 w-6" />
                    </div>
                    <Badge variant="secondary">{ROLE_LABEL[team.role]}</Badge>
                  </div>
                  <CardTitle className="pt-3">
                    <Link
                      href={`/t/${team.id}/projects`}
                      className="hover:text-brand"
                    >
                      {team.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    一个空间，连接团队成员与共同目标
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-3">
                    <div>
                      <p className="text-xl font-semibold">
                        {team.memberCount}
                      </p>
                      <p className="text-xs text-muted-foreground">协作成员</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold">
                        {team.projectCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        进行中的项目
                      </p>
                    </div>
                  </div>
                  <InviteCode code={team.inviteCode} />
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <Link
                      href={`/t/${team.id}/members`}
                      className="text-xs text-muted-foreground hover:text-brand"
                    >
                      成员与角色
                    </Link>
                    <Button asChild size="sm">
                      <Link href={`/t/${team.id}/projects`}>
                        进入空间
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export async function TeamProjectsView({
  teamId,
  kind,
}: {
  teamId: string;
  kind?: string;
}) {
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const [teams, projects, members] = await Promise.all([
    listMyTeams(user.id),
    listTeamProjects(user.id, teamId),
    listTeamMembers(user.id, teamId),
  ]);
  const team = teams.find((item) => item.id === teamId);
  if (!team) notFound();
  const canCreate = membership.role === "admin";
  const selected: ProjectKind | undefined = [
    "course",
    "lab",
    "contest",
  ].includes(kind ?? "")
    ? (kind as ProjectKind)
    : undefined;
  const visible = projects.filter(
    (project) => !selected || project.kind === selected,
  );
  const summaries = await Promise.all(
    visible.map(async (project) => ({
      project,
      tasks: await listProjectTasks(user.id, project.id, {
        parentTaskId: null,
      }),
    })),
  );
  return (
    <main className="space-y-6">
      <header>
        <Link
          href="/t"
          className="text-xs text-muted-foreground hover:text-brand"
        >
          团队与空间 /
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {team.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {members.length} 位成员 · {projects.length} 个项目 ·
              从共同目标进入任务协作
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/members`}>
                <Users className="h-4 w-4" />
                成员与角色
              </Link>
            </Button>
            {canCreate && (
              <CreateProjectButton
                key={selected ?? "all"}
                teamId={teamId}
                defaultKind={selected}
              />
            )}
          </div>
        </div>
      </header>
      <CollaborationPath current={2} />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">邀请团队成员</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            分享邀请码；加入后，管理员可将指导老师设为教师。
          </p>
        </div>
        <InviteCode code={team.inviteCode} />
      </section>
      <nav aria-label="项目类型筛选" className="flex flex-wrap gap-2">
        <Button asChild variant={!selected ? "default" : "outline"} size="sm">
          <Link href={`/t/${teamId}/projects`}>全部项目 {projects.length}</Link>
        </Button>
        {Object.entries(KIND_META).map(([key, meta]) => (
          <Button
            asChild
            key={key}
            variant={selected === key ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/t/${teamId}/projects?kind=${key}`}>
              <meta.icon className="h-3.5 w-3.5" />
              {meta.title}{" "}
              {projects.filter((project) => project.kind === key).length}
            </Link>
          </Button>
        ))}
      </nav>
      {summaries.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FolderKanban className="mx-auto mb-4 h-10 w-10 text-brand" />
          <h2 className="text-lg font-semibold">
            {projects.length === 0
              ? "让团队的第一个目标落地"
              : "这个分类还没有项目"}
          </h2>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">
            {canCreate
              ? "选择课程、实验室课题或竞赛，建立项目后即可拆分任务。"
              : "请联系团队管理员创建项目，你可以先在成员页了解团队分工。"}
          </p>
          {canCreate && (
            <CreateProjectButton
              key={selected ?? "all"}
              teamId={teamId}
              defaultKind={selected}
            />
          )}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.map(({ project, tasks }) => {
            const meta = project.kind
              ? KIND_META[project.kind]
              : { title: "团队项目", icon: FolderKanban };
            const accepted = tasks.filter(
              (task) => task.status === "accepted",
            ).length;
            const percent = tasks.length
              ? Math.round((accepted / tasks.length) * 100)
              : 0;
            return (
              <Card
                key={project.id}
                className="transition hover:border-brand/35 hover:shadow-sm"
              >
                <CardHeader>
                  <div className="flex justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-brand">
                      <meta.icon className="h-4 w-4" />
                      {meta.title}
                    </span>
                    <Badge
                      variant={
                        project.status === "active" ? "default" : "secondary"
                      }
                    >
                      {project.status === "active" ? "进行中" : "已归档"}
                    </Badge>
                  </div>
                  <CardTitle className="pt-2">
                    <Link
                      href={`/p/${project.id}/board`}
                      className="hover:text-brand"
                    >
                      {project.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {project.description ||
                      "进入看板，拆分目标并明确每个人的下一步。"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        验收完成 {accepted}/{tasks.length}
                      </span>
                      <span className="font-semibold">{percent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${project.name}验收完成度`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {(
                      [
                        "unclaimed",
                        "in_progress",
                        "submitted",
                        "rejected",
                      ] as const
                    ).map((status) => (
                      <span
                        key={status}
                        className="inline-flex items-center gap-1"
                      >
                        <StatusPill status={status} />
                        <span>
                          {
                            tasks.filter((task) => task.status === status)
                              .length
                          }
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <span className="text-xs text-muted-foreground">
                      {project.startDate || "未设开始日期"} →{" "}
                      {project.endDate || "未设结束日期"}
                    </span>
                    <Button asChild size="sm">
                      <Link href={`/p/${project.id}/board`}>
                        进入看板
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}

export async function TeamMembersView({ teamId }: { teamId: string }) {
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const [members, teams] = await Promise.all([
    listTeamMembers(user.id, teamId),
    listMyTeams(user.id),
  ]);
  const team = teams.find((item) => item.id === teamId);
  if (!team) notFound();
  return (
    <main className="space-y-6">
      <header>
        <Link
          href={`/t/${teamId}/projects`}
          className="text-xs text-muted-foreground hover:text-brand"
        >
          ← {team.name} / 团队项目
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">成员与角色</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          学生认领与提交，教师指派与验收，管理员维护空间和成员。
        </p>
      </header>
      <CollaborationPath current={1} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <Card key={`${member.id}-${member.role}`}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-semibold text-brand">
                  {member.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <CardTitle>
                    {member.name}
                    {member.id === user.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        我
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {member.email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
              <p className="text-xs text-muted-foreground">
                {member.role === "admin"
                  ? "建立项目、维护成员，并参与任务协作"
                  : member.role === "teacher"
                    ? "安排负责人、查看成果、通过或打回验收"
                    : "认领任务、记录工时、提交成果和修改重交"}
              </p>
              {membership.role === "admin" && (
                <MemberRoleForm teamId={teamId} member={member} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
